import { Injectable } from '@nestjs/common';
import type {
  CodigoMaterial,
  DatosCalificacion,
  DatosCoordinacion,
  TIPOS_PROBLEMA_OPERACION,
} from '@reciclomap/shared';
import type { Prisma } from '../../generado/prisma/client.js';
import type { OperacionEstado } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { NegociosRepositorio } from '../negocios/negocios.repositorio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { esViolacionUnica } from '../publicaciones/publicaciones.repositorio.js';
import { nombreCorto } from '../publicaciones/textos.js';
import { ProgresoService } from '../juego/progreso.service.js';
import { completarOperacion } from './cierre.js';
import { avisosOperacion } from './textos.js';

const HORA_MS = 3_600_000;
// Marca de orden de bytes: Excel la necesita para leer las tildes del CSV
const BOM = String.fromCharCode(0xfeff);
export const EN_CURSO: OperacionEstado[] = ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'];
const GRUPOS_HISTORIAL: Record<string, OperacionEstado[] | null> = {
  todas: null,
  'en-curso': EN_CURSO,
  completadas: ['COMPLETADA'],
  canceladas: ['CANCELADA'],
};

export type Parte = 'RECICLADOR' | 'NEGOCIO';
export type Accion =
  | 'coordinar'
  | 'entregar'
  | 'cancelar'
  | 'confirmar'
  | 'corregirKilos'
  | 'conforme'
  | 'noConforme'
  | 'abrirIncidencia'
  | 'calificar'
  | 'volverAPublicar'
  | 'reportarProblema';

type Fila = {
  id: string;
  estado: OperacionEstado;
  en_disputa: boolean;
  reciclador_id: string;
  comprador_id: string;
  publicacion_id: string;
  entregada_en: Date | null;
  confirmada_en: Date | null;
  correccion_pedida_en: Date | null;
  plazo_aviso_entrega_horas: number | null;
  plazo_conformidad_horas: number | null;
};

const seleccionContexto = {
  id: true,
  publicacionId: true,
  publicacion: { select: { cantidadKg: true, material: { select: { codigo: true, nombre: true } } } },
  oferta: { select: { precioKg: true, total: true } },
  reciclador: { select: { id: true, nombre: true } },
  comprador: { select: { id: true, tipo: true, nombreComercial: true, usuarioId: true } },
} satisfies Prisma.OperacionSelect;

// Hoy en Lima, como fecha (YYYY-MM-DD)
const hoyEnLima = (desplazamientoDias = 0) =>
  new Date(Date.now() + desplazamientoDias * 24 * HORA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

@Injectable()
export class OperacionesService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
    private readonly negocios: NegociosRepositorio,
    private readonly progreso: ProgresoService,
  ) {}

  async plazoHoras(clave: 'plazo_conformidad_horas' | 'plazo_aviso_entrega_horas'): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave }, select: { valor: true } });
    const valor = Number(fila?.valor);
    return Number.isFinite(valor) && valor > 0 ? valor : 72;
  }

  // Pantalla 26: compartida; cada rol recibe solo sus acciones
  async detalle(usuario: UsuarioSesion, id: string) {
    const operacion = await this.prisma.operacion.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        enDisputa: true,
        creadaEn: true,
        coordinadaEn: true,
        entregadaEn: true,
        confirmadaEn: true,
        completadaEn: true,
        canceladaEn: true,
        completadaPorPlazo: true,
        kgFinal: true,
        montoFinal: true,
        motivoCancelacion: true,
        canceladaPorId: true,
        correccionPedidaEn: true,
        recicladorId: true,
        compradorId: true,
        publicacionId: true,
        oferta: { select: { precioKg: true, total: true, mensaje: true, cuandoRecoge: true, creadaEn: true } },
        publicacion: {
          select: {
            estado: true,
            cantidadKg: true,
            creadaEn: true,
            material: { select: { codigo: true, nombre: true } },
          },
        },
        reciclador: { select: { nombre: true, telefono: true, estado: true } },
        comprador: {
          select: {
            tipo: true,
            nombreComercial: true,
            whatsapp: true,
            eliminadoEn: true,
            direccion: true,
            vehiculo: true,
            usuarioId: true,
          },
        },
        coordinacion: {
          select: { tipo: true, referencia: true, dia: true, franja: true, mensaje: true, definidaEn: true },
        },
        calificaciones: { select: { autorId: true, estrellas: true } },
        movimientos: { where: { motivo: 'OPERACION' }, select: { puntos: true } },
        reportes: {
          where: { tipo: 'OPERACION' },
          orderBy: { creadoEn: 'desc' },
          take: 1,
          select: { estado: true, motivo: true, detalle: true, decision: true, resolucion: true, creadoEn: true },
        },
      },
    });
    const parte = operacion ? this.parteDe(usuario, operacion) : null;
    if (!operacion || !parte) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa operación.', 404);
    const [pin] = operacion.coordinacion
      ? await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
          SELECT ST_Y(pin::geometry) AS lat, ST_X(pin::geometry) AS lng FROM coordinacion
           WHERE operacion_id = ${id}::uuid AND pin IS NOT NULL`
      : [];
    // Cada operación conserva el plazo que regía al entrar al estado; sin dato (operaciones antiguas) rige el vigente
    const [vigenteConformidad, vigenteEntrega] = await Promise.all([
      this.plazoHoras('plazo_conformidad_horas'),
      this.plazoHoras('plazo_aviso_entrega_horas'),
    ]);
    const [propios] = await this.prisma.$queryRaw<Array<{ c: number | null; e: number | null }>>`
      SELECT plazo_conformidad_horas AS c, plazo_aviso_entrega_horas AS e FROM operacion WHERE id = ${id}::uuid`;
    const horasConformidad = propios?.c ?? vigenteConformidad;
    const horasEntrega = propios?.e ?? vigenteEntrega;
    const mia = operacion.calificaciones.find((c) => c.autorId === usuario.id) ?? null;
    const incidencia = operacion.reportes[0] ?? null;
    const sinConfirmarDesde = operacion.entregadaEn
      ? new Date(operacion.entregadaEn.getTime() + horasEntrega * HORA_MS)
      : null;
    const acciones = this.acciones(parte, {
      estado: operacion.estado,
      enDisputa: operacion.enDisputa,
      correccionPedida: operacion.correccionPedidaEn !== null,
      sinConfirmarVencido: sinConfirmarDesde !== null && sinConfirmarDesde.getTime() <= Date.now(),
      calificada: mia !== null,
      canceladaPorNegocio: operacion.canceladaPorId === operacion.comprador.usuarioId,
      publicacionCancelada: operacion.publicacion.estado === 'CANCELADA',
    });
    const esCentro = operacion.comprador.tipo === 'CENTRO';
    return {
      id: operacion.id,
      estado: operacion.estado,
      enDisputa: operacion.enDisputa,
      rol: parte,
      publicacionId: operacion.publicacionId,
      material: operacion.publicacion.material as { codigo: CodigoMaterial; nombre: string },
      kg: Number(operacion.publicacion.cantidadKg),
      precioKg: operacion.oferta.precioKg.toFixed(2),
      total: operacion.oferta.total.toFixed(2),
      kgFinal: operacion.kgFinal ? Number(operacion.kgFinal) : null,
      montoFinal: operacion.montoFinal?.toFixed(2) ?? null,
      mensaje: operacion.oferta.mensaje,
      cuandoRecoge: operacion.oferta.cuandoRecoge,
      fechas: {
        publicada: operacion.publicacion.creadaEn.toISOString(),
        ofertaRecibida: operacion.oferta.creadaEn.toISOString(),
        aceptada: operacion.creadaEn.toISOString(),
        coordinada: operacion.coordinadaEn?.toISOString() ?? null,
        entregada: operacion.entregadaEn?.toISOString() ?? null,
        confirmada: operacion.confirmadaEn?.toISOString() ?? null,
        completada: operacion.completadaEn?.toISOString() ?? null,
        cancelada: operacion.canceladaEn?.toISOString() ?? null,
      },
      completadaPorPlazo: operacion.completadaPorPlazo,
      plazos: {
        conformidadHasta: operacion.confirmadaEn
          ? new Date(operacion.confirmadaEn.getTime() + horasConformidad * HORA_MS).toISOString()
          : null,
        incidenciaDesde: sinConfirmarDesde?.toISOString() ?? null,
      },
      contraparte:
        parte === 'RECICLADOR'
          ? {
              negocioId: operacion.compradorId as string | null,
              tipo: operacion.comprador.tipo,
              nombre: operacion.comprador.nombreComercial,
              // Una cuenta eliminada ya no tiene contacto
              whatsapp: operacion.comprador.eliminadoEn ? null : operacion.comprador.whatsapp,
              direccion: esCentro ? operacion.comprador.direccion : null,
              vehiculo: operacion.comprador.vehiculo,
            }
          : {
              negocioId: null,
              tipo: 'RECICLADOR' as const,
              nombre: nombreCorto(operacion.reciclador.nombre),
              whatsapp: operacion.reciclador.estado === 'ELIMINADO' ? null : operacion.reciclador.telefono,
              direccion: null,
              vehiculo: null,
            },
      puedeEncontrarseEnElLocal: esCentro,
      coordinacion: operacion.coordinacion
        ? {
            tipo: operacion.coordinacion.tipo,
            referencia: operacion.coordinacion.referencia,
            direccionDelLocal:
              operacion.coordinacion.tipo === 'LOCAL_DEL_CENTRO' ? operacion.comprador.direccion : null,
            pin: pin ?? null,
            dia: operacion.coordinacion.dia?.toISOString().slice(0, 10) ?? null,
            franja: operacion.coordinacion.franja,
            mensaje: operacion.coordinacion.mensaje,
            definidaEn: operacion.coordinacion.definidaEn.toISOString(),
          }
        : null,
      cancelacion:
        operacion.estado === 'CANCELADA'
          ? {
              motivo: operacion.motivoCancelacion,
              por:
                operacion.canceladaPorId === operacion.recicladorId
                  ? ('RECICLADOR' as const)
                  : operacion.canceladaPorId === operacion.comprador.usuarioId
                    ? ('NEGOCIO' as const)
                    : ('ADMINISTRACION' as const),
            }
          : null,
      incidencia: incidencia
        ? {
            estado: incidencia.estado,
            motivo: incidencia.motivo,
            detalle: incidencia.detalle,
            decision: incidencia.decision,
            resolucion: incidencia.resolucion,
            abiertaEn: incidencia.creadoEn.toISOString(),
            correccionPedida: operacion.correccionPedidaEn !== null,
          }
        : null,
      puntos: parte === 'RECICLADOR' ? (operacion.movimientos[0]?.puntos ?? null) : null,
      miCalificacion: mia ? { estrellas: mia.estrellas } : null,
      acciones,
    };
  }

  // Pantalla 25: el reciclador define el punto; "En el local del centro" solo si el comprador es un centro
  async coordinar(usuario: UsuarioSesion, id: string, datos: DatosCoordinacion) {
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id, 'RECICLADOR');
      if (!['ACEPTADA', 'EN_COORDINACION'].includes(fila.estado)) {
        throw new ErrorNegocio('OPERACION_NO_COORDINABLE', 'El punto de encuentro ya no se puede cambiar.', 409);
      }
      const contexto = await tx.operacion.findUniqueOrThrow({ where: { id }, select: seleccionContexto });
      if (datos.tipo === 'LOCAL_DEL_CENTRO' && contexto.comprador.tipo !== 'CENTRO') {
        throw new ErrorNegocio('SIN_LOCAL', 'Un comprador móvil no tiene local: escribe una referencia.', 422, [
          { campo: 'tipo', mensaje: 'Elige una referencia.' },
        ]);
      }
      if (datos.dia && (datos.dia < hoyEnLima() || datos.dia > hoyEnLima(7))) {
        throw new ErrorNegocio('DIA_NO_VALIDO', 'Elige un día entre hoy y los próximos 7 días.', 422, [
          { campo: 'dia', mensaje: 'Elige un día cercano.' },
        ]);
      }
      if (datos.pin) {
        const { ciudadId } = await tx.usuario.findUniqueOrThrow({
          where: { id: usuario.id },
          select: { ciudadId: true },
        });
        await this.negocios.exigirPinEnCiudad(tx, ciudadId, datos.pin);
      }
      const referencia = datos.tipo === 'REFERENCIA' ? (datos.referencia ?? null) : null;
      const lat = datos.tipo === 'REFERENCIA' ? (datos.pin?.lat ?? null) : null;
      const lng = datos.tipo === 'REFERENCIA' ? (datos.pin?.lng ?? null) : null;
      await tx.$executeRaw`
        INSERT INTO coordinacion (operacion_id, tipo, referencia, pin, dia, franja, mensaje, definida_en)
        VALUES (${id}::uuid, ${datos.tipo}::punto_encuentro_tipo, ${referencia},
                CASE WHEN ${lat}::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography END,
                ${datos.dia ?? null}::date, ${datos.franja ?? null}::franja, ${datos.mensaje || null}, now())
        ON CONFLICT (operacion_id) DO UPDATE SET tipo = EXCLUDED.tipo, referencia = EXCLUDED.referencia, pin = EXCLUDED.pin,
          dia = EXCLUDED.dia, franja = EXCLUDED.franja, mensaje = EXCLUDED.mensaje, definida_en = now()`;
      if (fila.estado === 'ACEPTADA') {
        await tx.operacion.update({ where: { id }, data: { estado: 'EN_COORDINACION', coordinadaEn: new Date() } });
      }
      await this.notificaciones.crear(
        tx,
        avisosOperacion.puntoDefinido({
          ...this.baseAviso(contexto, contexto.comprador.usuarioId),
          reciclador: nombreCorto(contexto.reciclador.nombre),
        }),
      );
    });
    return this.detalle(usuario, id);
  }

  // "Ya entregué": arranca el plazo de 72 h para el aviso de entrega sin confirmar
  async entregar(usuario: UsuarioSesion, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id, 'RECICLADOR');
      if (fila.estado !== 'EN_COORDINACION') {
        throw new ErrorNegocio(
          'OPERACION_NO_ENTREGABLE',
          fila.estado === 'ACEPTADA'
            ? 'Primero define el punto de encuentro.'
            : 'Esta operación ya no se puede marcar como entregada.',
          409,
        );
      }
      await tx.operacion.update({ where: { id }, data: { estado: 'ENTREGADA', entregadaEn: new Date() } });
      const contexto = await tx.operacion.findUniqueOrThrow({ where: { id }, select: seleccionContexto });
      await this.notificaciones.crear(
        tx,
        avisosOperacion.entregado(this.baseAviso(contexto, contexto.comprador.usuarioId)),
      );
    });
    return this.detalle(usuario, id);
  }

  // Con una de las dos cuentas suspendida no se ejecutan pasos que generan puntos o kilos confirmados; se puede leer,
  // cancelar (si aún no se entregó) o abrir una incidencia, y la administración resuelve
  private async hayCuentaSuspendida(tx: ClienteBd, id: string): Promise<boolean> {
    const [fila] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
        FROM operacion o
        JOIN comprador c ON c.id = o.comprador_id
        JOIN usuario u ON u.id IN (o.reciclador_id, c.usuario_id)
       WHERE o.id = ${id}::uuid AND u.estado = 'SUSPENDIDO'`;
    return (fila?.n ?? 0) > 0;
  }

  private async exigirCuentasActivas(tx: ClienteBd, id: string): Promise<void> {
    if (await this.hayCuentaSuspendida(tx, id)) {
      throw new ErrorNegocio(
        'CONTRAPARTE_SUSPENDIDA',
        'La otra cuenta de esta operación está suspendida: no se pueden confirmar kilos ni cerrarla. Puedes cancelarla si aún no se entregó o reportar un problema, y la administración lo resuelve.',
        409,
      );
    }
  }

  // "Recibí": solo el negocio escribe los kilos (C9). También corrige los kilos si el administrador lo pidió
  async confirmar(usuario: UsuarioSesion, id: string, kgRecibidos: number) {
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id, 'NEGOCIO');
      await this.exigirCuentasActivas(tx, id);
      const corrigiendo = fila.estado === 'CONFIRMADA' && fila.correccion_pedida_en !== null;
      if (fila.estado !== 'ENTREGADA' && !corrigiendo) {
        throw new ErrorNegocio(
          'OPERACION_NO_CONFIRMABLE',
          fila.estado === 'CONFIRMADA'
            ? 'Ya confirmaste los kilos. Solo se corrigen si un administrador lo pide.'
            : 'El reciclador aún no marcó la entrega.',
          409,
        );
      }
      const contexto = await tx.operacion.findUniqueOrThrow({ where: { id }, select: seleccionContexto });
      const ahora = new Date();
      await tx.operacion.update({
        where: { id },
        data: {
          estado: 'CONFIRMADA',
          kgFinal: kgRecibidos,
          montoFinal: Math.round(kgRecibidos * Number(contexto.oferta.precioKg) * 100) / 100,
          confirmadaEn: ahora,
          enDisputa: false,
          correccionPedidaEn: null,
        },
      });
      // Confirmar o corregir resuelve la incidencia abierta y vuelve a correr el plazo de conformidad
      await tx.reporte.updateMany({
        where: {
          operacionId: id,
          tipo: 'OPERACION',
          estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] },
        },
        data: {
          estado: 'RESUELTO',
          resueltoEn: ahora,
          resolucion: corrigiendo ? 'KILOS_CORREGIDOS' : null,
          decision: corrigiendo ? 'El negocio corrigió los kilos recibidos.' : 'El negocio confirmó la recepción.',
        },
      });
      await this.notificaciones.crear(
        tx,
        avisosOperacion.recepcionConfirmada({
          ...this.baseAviso(contexto, contexto.reciclador.id),
          kg: kgRecibidos,
          negocio: contexto.comprador.nombreComercial,
        }),
      );
    });
    return this.detalle(usuario, id);
  }

  // "Conforme": cierra la operación con sus efectos en una sola transacción
  async conforme(usuario: UsuarioSesion, id: string) {
    const resultado = await this.cerrar(id, async (tx) => {
      const fila = await this.propia(tx, usuario, id, 'RECICLADOR');
      if (fila.estado !== 'CONFIRMADA' || fila.en_disputa) {
        throw new ErrorNegocio('OPERACION_NO_CONFIRMADA', 'Esta operación ya no espera tu conformidad.', 409);
      }
      await this.exigirCuentasActivas(tx, id);
      return completarOperacion(tx, id, { porPlazo: false });
    });
    return {
      ...(await this.detalle(usuario, id)),
      puntosGanados: resultado.puntos,
      girosNuevos: resultado.girosNuevos,
    };
  }

  // Cierre automático a las 72 h en CONFIRMADA sin respuesta ni disputa
  async cerrarPorPlazo(id: string): Promise<boolean> {
    const vigente = await this.plazoHoras('plazo_conformidad_horas');
    try {
      await this.cerrar(id, async (tx) => {
        const [fila] = await tx.$queryRaw<Fila[]>`
          SELECT estado::text AS estado, en_disputa, confirmada_en, plazo_conformidad_horas FROM operacion WHERE id = ${id}::uuid FOR UPDATE`;
        const horas = fila?.plazo_conformidad_horas ?? vigente;
        if (
          !fila ||
          fila.estado !== 'CONFIRMADA' ||
          fila.en_disputa ||
          !fila.confirmada_en ||
          fila.confirmada_en.getTime() + horas * HORA_MS > Date.now() ||
          // Con una cuenta suspendida el cierre automático espera: lo resuelve la administración
          (await this.hayCuentaSuspendida(tx, id))
        ) {
          throw new ErrorNegocio('OPERACION_NO_CONFIRMADA', 'Ya no corresponde cerrarla.', 409);
        }
        return completarOperacion(tx, id, { porPlazo: true });
      });
      return true;
    } catch (error) {
      if (error instanceof ErrorNegocio && error.codigo === 'OPERACION_NO_CONFIRMADA') return false;
      throw error;
    }
  }

  // "No conforme": se abre la incidencia y se detiene el plazo
  async noConforme(usuario: UsuarioSesion, id: string, detalle: string) {
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id, 'RECICLADOR');
      if (fila.estado !== 'CONFIRMADA' || fila.en_disputa) {
        throw new ErrorNegocio('OPERACION_NO_CONFIRMADA', 'Esta operación ya no espera tu conformidad.', 409);
      }
      await this.abrir(tx, usuario, id, 'NO_CONFORME', detalle);
    });
    return this.detalle(usuario, id);
  }

  // 72 h en ENTREGADA sin confirmación: el reciclador puede abrir una incidencia; no hay cierre automático
  async abrirIncidencia(usuario: UsuarioSesion, id: string, detalle: string) {
    const vigente = await this.plazoHoras('plazo_aviso_entrega_horas');
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id, 'RECICLADOR');
      const horas = fila.plazo_aviso_entrega_horas ?? vigente;
      const vencido = fila.entregada_en !== null && fila.entregada_en.getTime() + horas * HORA_MS <= Date.now();
      if (fila.estado !== 'ENTREGADA' || fila.en_disputa || !vencido) {
        throw new ErrorNegocio(
          'INCIDENCIA_NO_DISPONIBLE',
          'Podrás abrir una incidencia si pasan 72 horas sin que confirmen la recepción.',
          409,
        );
      }
      await this.abrir(tx, usuario, id, 'NO_CONFIRMA', detalle);
    });
    return this.detalle(usuario, id);
  }

  // Pantalla 29: cualquiera de las partes reporta un problema; no cambia la operación ni sus plazos
  async reportarProblema(
    usuario: UsuarioSesion,
    id: string,
    tipo: (typeof TIPOS_PROBLEMA_OPERACION)[number],
    detalle: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.propia(tx, usuario, id);
      const abierto = await tx.reporte.count({
        where: {
          tipo: 'OPERACION',
          operacionId: id,
          autorId: usuario.id,
          motivo: tipo,
          estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] },
        },
      });
      if (abierto > 0) {
        throw new ErrorNegocio('YA_REPORTADO', 'Ya reportaste este problema. Un administrador lo está revisando.', 409);
      }
      await tx.reporte.create({
        data: { tipo: 'OPERACION', autorId: usuario.id, operacionId: id, motivo: tipo, detalle },
      });
      const contexto = await tx.operacion.findUniqueOrThrow({ where: { id }, select: seleccionContexto });
      const admins = await tx.usuario.findMany({ where: { rol: 'ADMIN', estado: 'ACTIVO' }, select: { id: true } });
      for (const admin of admins) {
        await this.notificaciones.crear(tx, {
          ...avisosOperacion.incidenciaAbierta(this.baseAviso(contexto, admin.id)),
          enlace: '/admin/incidencias',
        });
      }
    });
    return { reportado: true };
  }

  // Mis reportes de operaciones con su estado (pantalla 29)
  async misIncidencias(usuario: UsuarioSesion) {
    const filas = await this.prisma.reporte.findMany({
      where: { tipo: 'OPERACION', autorId: usuario.id },
      orderBy: { creadoEn: 'desc' },
      take: 20,
      select: {
        id: true,
        motivo: true,
        estado: true,
        decision: true,
        creadoEn: true,
        resueltoEn: true,
        operacion: {
          select: {
            id: true,
            publicacion: { select: { material: { select: { codigo: true, nombre: true } } } },
            comprador: { select: { nombreComercial: true } },
            reciclador: { select: { nombre: true } },
          },
        },
      },
    });
    return {
      datos: filas.map((fila) => ({
        id: fila.id,
        motivo: fila.motivo,
        estado: fila.estado,
        decision: fila.estado === 'RESUELTO' || fila.estado === 'DESCARTADO' ? fila.decision : null,
        creadoEn: fila.creadoEn.toISOString(),
        operacion: fila.operacion
          ? {
              id: fila.operacion.id,
              material: fila.operacion.publicacion.material.nombre,
              contraparte:
                usuario.rol === 'RECICLADOR'
                  ? fila.operacion.comprador.nombreComercial
                  : nombreCorto(fila.operacion.reciclador.nombre),
            }
          : null,
      })),
    };
  }

  // Cualquiera de las partes, con motivo y antes de la entrega; la publicación queda cancelada
  async cancelar(usuario: UsuarioSesion, id: string, motivo: string) {
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id);
      if (!['ACEPTADA', 'EN_COORDINACION'].includes(fila.estado)) {
        throw new ErrorNegocio(
          'OPERACION_NO_CANCELABLE',
          'Después de la entrega ya no se puede cancelar. Si hay un problema, abre una incidencia.',
          409,
        );
      }
      const ahora = new Date();
      await tx.operacion.update({
        where: { id },
        data: { estado: 'CANCELADA', motivoCancelacion: motivo, canceladaPorId: usuario.id, canceladaEn: ahora },
      });
      await tx.publicacion.update({
        where: { id: fila.publicacion_id },
        data: {
          estado: 'CANCELADA',
          motivoCancelacion: `Operación cancelada: ${motivo}`.slice(0, 200),
          canceladaPorId: usuario.id,
        },
      });
      const contexto = await tx.operacion.findUniqueOrThrow({ where: { id }, select: seleccionContexto });
      const otra = usuario.id === fila.reciclador_id ? contexto.comprador.usuarioId : fila.reciclador_id;
      await this.notificaciones.crear(tx, avisosOperacion.cancelada({ ...this.baseAviso(contexto, otra), motivo }));
    });
    return this.detalle(usuario, id);
  }

  // Pantalla 27: una por autor y operación, solo tras COMPLETADA, con etiquetas de su dirección
  async calificar(usuario: UsuarioSesion, id: string, datos: DatosCalificacion) {
    const operacion = await this.prisma.operacion.findUnique({
      where: { id },
      select: { estado: true, recicladorId: true, compradorId: true, comprador: { select: { usuarioId: true } } },
    });
    const parte = operacion ? this.parteDe(usuario, operacion) : null;
    if (!operacion || !parte) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa operación.', 404);
    if (operacion.estado !== 'COMPLETADA') {
      throw new ErrorNegocio('OPERACION_NO_COMPLETADA', 'Solo se califica una operación completada.', 409);
    }
    const destinoId = parte === 'RECICLADOR' ? operacion.comprador.usuarioId : operacion.recicladorId;
    const etiquetas = await this.prisma.etiquetaCalificacion.findMany({
      where: {
        destino: parte === 'RECICLADOR' ? 'NEGOCIO' : 'RECICLADOR',
        activa: true,
        codigo: { in: datos.etiquetas },
      },
      select: { id: true, codigo: true },
    });
    if (etiquetas.length !== new Set(datos.etiquetas).size) {
      throw new ErrorNegocio('ETIQUETA_NO_VALIDA', 'Alguna etiqueta no corresponde a esta calificación.', 422, [
        { campo: 'etiquetas', mensaje: 'Elige etiquetas de la lista.' },
      ]);
    }
    try {
      await this.prisma.calificacion.create({
        data: {
          operacionId: id,
          autorId: usuario.id,
          destinoId,
          estrellas: datos.estrellas,
          comentario: datos.comentario || null,
          etiquetas: { create: etiquetas.map((etiqueta) => ({ etiquetaId: etiqueta.id })) },
        },
      });
    } catch (error) {
      if (esViolacionUnica(error)) {
        throw new ErrorNegocio('YA_CALIFICADA', 'Ya calificaste esta operación.', 409);
      }
      throw error;
    }
    return this.detalle(usuario, id);
  }

  // Pantallas 28 y 51: historial propio con indicadores
  async historial(usuario: UsuarioSesion, estado: string, material?: CodigoMaterial) {
    const parte: Parte = usuario.rol === 'RECICLADOR' ? 'RECICLADOR' : 'NEGOCIO';
    const filas = await this.prisma.operacion.findMany({
      where: parte === 'RECICLADOR' ? { recicladorId: usuario.id } : { compradorId: this.negocio(usuario) },
      orderBy: { creadaEn: 'desc' },
      select: {
        id: true,
        estado: true,
        enDisputa: true,
        creadaEn: true,
        completadaEn: true,
        kgFinal: true,
        montoFinal: true,
        motivoCancelacion: true,
        oferta: { select: { precioKg: true, total: true } },
        publicacion: { select: { cantidadKg: true, material: { select: { codigo: true, nombre: true } } } },
        reciclador: { select: { nombre: true } },
        comprador: { select: { nombreComercial: true, tipo: true } },
        movimientos: { where: { motivo: 'OPERACION' }, select: { puntos: true } },
        calificaciones: { where: { autorId: usuario.id }, select: { id: true } },
      },
    });
    const todas = filas.map((fila) => ({
      id: fila.id,
      fecha: (fila.completadaEn ?? fila.creadaEn).toISOString(),
      estado: fila.estado,
      enDisputa: fila.enDisputa,
      material: fila.publicacion.material as { codigo: CodigoMaterial; nombre: string },
      kg: Number(fila.kgFinal ?? fila.publicacion.cantidadKg),
      kgConfirmados: fila.kgFinal !== null,
      precioKg: fila.oferta.precioKg.toFixed(2),
      total: (fila.montoFinal ?? fila.oferta.total).toFixed(2),
      contraparte: parte === 'RECICLADOR' ? fila.comprador.nombreComercial : nombreCorto(fila.reciclador.nombre),
      contraparteTipo: parte === 'RECICLADOR' ? fila.comprador.tipo : ('RECICLADOR' as const),
      puntos: parte === 'RECICLADOR' ? (fila.movimientos[0]?.puntos ?? 0) : null,
      motivoCancelacion: fila.motivoCancelacion,
      calificada: fila.calificaciones.length > 0,
    }));
    const completadas = todas.filter((o) => o.estado === 'COMPLETADA');
    const estados = GRUPOS_HISTORIAL[estado] ?? null;
    const datos = todas.filter(
      (o) => (!estados || estados.includes(o.estado)) && (!material || o.material.codigo === material),
    );
    return {
      rol: parte,
      indicadores: {
        operaciones: todas.length,
        enCurso: todas.filter((o) => EN_CURSO.includes(o.estado)).length,
        kg: completadas.reduce((suma, o) => suma + o.kg, 0),
        monto: completadas.reduce((suma, o) => suma + Number(o.total), 0).toFixed(2),
        puntos: parte === 'RECICLADOR' ? completadas.reduce((suma, o) => suma + (o.puntos ?? 0), 0) : null,
        recicladores: parte === 'NEGOCIO' ? new Set(completadas.map((o) => o.contraparte)).size : null,
      },
      conteos: {
        todas: todas.length,
        'en-curso': todas.filter((o) => EN_CURSO.includes(o.estado)).length,
        completadas: completadas.length,
        canceladas: todas.filter((o) => o.estado === 'CANCELADA').length,
      },
      datos,
    };
  }

  // Exportación CSV del historial (28 y 51), con BOM para que Excel respete las tildes
  async csv(usuario: UsuarioSesion, estado: string, material?: CodigoMaterial): Promise<string> {
    const { rol, datos } = await this.historial(usuario, estado, material);
    const TEXTO: Record<OperacionEstado, string> = {
      ACEPTADA: 'Aceptada',
      EN_COORDINACION: 'En coordinación',
      ENTREGADA: 'Entregada',
      CONFIRMADA: 'Confirmada',
      COMPLETADA: 'Completada',
      CANCELADA: 'Cancelada',
    };
    const celda = (valor: string | number) => {
      const texto = String(valor);
      return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const encabezado =
      rol === 'RECICLADOR'
        ? ['Fecha', 'Material', 'Kg', 'Comprador', 'Precio por kg', 'Total', 'Estado', 'Puntos']
        : ['Fecha', 'Material', 'Kg', 'Reciclador', 'Precio por kg', 'Total', 'Estado'];
    const filas = datos.map((o) => {
      const comunes = [
        o.fecha.slice(0, 10),
        o.material.nombre,
        o.kg.toFixed(2),
        o.contraparte,
        o.precioKg,
        o.estado === 'CANCELADA' ? '' : o.total,
        TEXTO[o.estado],
      ];
      return rol === 'RECICLADOR' ? [...comunes, o.puntos ?? 0] : comunes;
    });
    return `${BOM}${[encabezado, ...filas].map((fila) => fila.map(celda).join(',')).join('\r\n')}\r\n`;
  }

  // Pantalla 54: ofertas enviadas, compras en curso y completadas del negocio
  async compras(usuario: UsuarioSesion) {
    const compradorId = this.negocio(usuario);
    const [ofertas, operaciones] = await Promise.all([
      this.prisma.oferta.findMany({
        where: { compradorId, estado: { in: ['PENDIENTE', 'RECHAZADA', 'NO_SELECCIONADA'] } },
        orderBy: { creadaEn: 'desc' },
        select: {
          id: true,
          estado: true,
          precioKg: true,
          total: true,
          creadaEn: true,
          publicacion: { select: { id: true, cantidadKg: true, material: { select: { codigo: true, nombre: true } } } },
        },
      }),
      this.historial(usuario, 'todas'),
    ]);
    const tramos = await this.prisma.$queryRaw<Array<{ id: string; tramo: string | null }>>`
      SELECT o.id, publicacion_tramo(o.publicacion_id, o.comprador_id)::text AS tramo
        FROM oferta o WHERE o.id = ANY(${ofertas.map((o) => o.id)}::uuid[])`;
    const tramoDe = new Map(tramos.map((t) => [t.id, t.tramo]));
    const inicioMes = new Date(`${hoyEnLima().slice(0, 8)}01T05:00:00.000Z`);
    return {
      indicadores: {
        ofertasEsperando: ofertas.filter((o) => o.estado === 'PENDIENTE').length,
        enCurso: operaciones.datos.filter((o) => EN_CURSO.includes(o.estado)).length,
        porConfirmar: operaciones.datos.filter((o) => o.estado === 'ENTREGADA').length,
        completadasMes: operaciones.datos.filter((o) => o.estado === 'COMPLETADA' && new Date(o.fecha) >= inicioMes)
          .length,
      },
      ofertas: ofertas.map((o) => ({
        id: o.id,
        estado: o.estado,
        precioKg: o.precioKg.toFixed(2),
        total: o.total.toFixed(2),
        fecha: o.creadaEn.toISOString(),
        publicacionId: o.publicacion.id,
        material: o.publicacion.material as { codigo: CodigoMaterial; nombre: string },
        kg: Number(o.publicacion.cantidadKg),
        tramo: tramoDe.get(o.id) ?? null,
      })),
      operaciones: operaciones.datos,
    };
  }

  // Acciones por rol y estado: la web nunca muestra un botón que la API rechazaría
  acciones(
    parte: Parte,
    e: {
      estado: OperacionEstado;
      enDisputa: boolean;
      correccionPedida: boolean;
      sinConfirmarVencido: boolean;
      calificada: boolean;
      canceladaPorNegocio: boolean;
      publicacionCancelada: boolean;
    },
  ): Accion[] {
    const lista: Accion[] = [];
    if (parte === 'RECICLADOR') {
      if (e.estado === 'ACEPTADA' || e.estado === 'EN_COORDINACION') lista.push('coordinar');
      if (e.estado === 'EN_COORDINACION') lista.push('entregar');
      if (e.estado === 'CONFIRMADA' && !e.enDisputa) lista.push('conforme', 'noConforme');
      if (e.estado === 'ENTREGADA' && !e.enDisputa && e.sinConfirmarVencido) lista.push('abrirIncidencia');
      if (e.estado === 'CANCELADA' && e.canceladaPorNegocio && e.publicacionCancelada) lista.push('volverAPublicar');
    } else {
      if (e.estado === 'ENTREGADA') lista.push('confirmar');
      if (e.estado === 'CONFIRMADA' && e.correccionPedida) lista.push('corregirKilos');
    }
    if (e.estado === 'ACEPTADA' || e.estado === 'EN_COORDINACION') lista.push('cancelar');
    if (e.estado === 'COMPLETADA' && !e.calificada) lista.push('calificar');
    // "Hubo un problema" (pantalla 29): siempre disponible para ambas partes
    lista.push('reportarProblema');
    return lista;
  }

  private async abrir(
    tx: ClienteBd,
    usuario: UsuarioSesion,
    id: string,
    motivo: 'NO_CONFORME' | 'NO_CONFIRMA',
    detalle: string,
  ): Promise<void> {
    await tx.operacion.update({ where: { id }, data: { enDisputa: true } });
    await tx.reporte.create({ data: { tipo: 'OPERACION', autorId: usuario.id, operacionId: id, motivo, detalle } });
    const contexto = await tx.operacion.findUniqueOrThrow({ where: { id }, select: seleccionContexto });
    const aviso =
      motivo === 'NO_CONFORME'
        ? (destino: string) =>
            avisosOperacion.noConforme({
              ...this.baseAviso(contexto, destino),
              reciclador: nombreCorto(contexto.reciclador.nombre),
            })
        : (destino: string) => avisosOperacion.incidenciaAbierta(this.baseAviso(contexto, destino));
    await this.notificaciones.crear(tx, aviso(contexto.comprador.usuarioId));
    const admins = await tx.usuario.findMany({ where: { rol: 'ADMIN', estado: 'ACTIVO' }, select: { id: true } });
    for (const admin of admins) {
      await this.notificaciones.crear(tx, { ...aviso(admin.id), enlace: '/admin/incidencias' });
    }
  }

  private async cerrar(
    id: string,
    accion: (tx: Prisma.TransactionClient) => Promise<Awaited<ReturnType<typeof completarOperacion>>>,
  ) {
    try {
      const resultado = await this.prisma.$transaction(async (tx) => {
        const hecho = await accion(tx);
        await this.avisarCierre(tx, id, hecho);
        return hecho;
      });
      await this.progreso.despuesDeCompletar(resultado);
      return resultado;
    } catch (error) {
      // Conformidad manual y cierre automático a la vez: el segundo encuentra la operación ya cerrada
      if (esViolacionUnica(error)) {
        throw new ErrorNegocio('OPERACION_NO_CONFIRMADA', 'Esta operación ya se completó.', 409);
      }
      throw error;
    }
  }

  async avisarCierre(tx: ClienteBd, id: string, resultado: Awaited<ReturnType<typeof completarOperacion>>) {
    const operacion = await tx.operacion.findUniqueOrThrow({ where: { id }, select: { completadaPorPlazo: true } });
    const base = { operacionId: id, material: resultado.material, kg: resultado.kg };
    if (operacion.completadaPorPlazo) {
      await this.notificaciones.crear(
        tx,
        avisosOperacion.completadaPorPlazo({ ...base, usuarioId: resultado.recicladorId }),
      );
      await this.notificaciones.crear(
        tx,
        avisosOperacion.completadaPorPlazo({ ...base, usuarioId: resultado.negocioUsuarioId }),
      );
      return;
    }
    await this.notificaciones.crear(
      tx,
      avisosOperacion.completadaReciclador({ ...base, usuarioId: resultado.recicladorId, puntos: resultado.puntos }),
    );
    await this.notificaciones.crear(
      tx,
      avisosOperacion.completadaNegocio({ ...base, usuarioId: resultado.negocioUsuarioId }),
    );
  }

  private baseAviso(contexto: Prisma.OperacionGetPayload<{ select: typeof seleccionContexto }>, usuarioId: string) {
    return {
      usuarioId,
      operacionId: contexto.id,
      material: contexto.publicacion.material.nombre,
      kg: contexto.publicacion.cantidadKg.toString(),
    };
  }

  // Bloquea la fila: cada transición revalida el estado de partida
  private async propia(tx: ClienteBd, usuario: UsuarioSesion, id: string, exigida?: Parte): Promise<Fila> {
    const [fila] = await tx.$queryRaw<Fila[]>`
      SELECT id, estado::text AS estado, en_disputa, reciclador_id, comprador_id, publicacion_id,
             entregada_en, confirmada_en, correccion_pedida_en, plazo_aviso_entrega_horas, plazo_conformidad_horas
        FROM operacion WHERE id = ${id}::uuid FOR UPDATE`;
    const parte = fila
      ? this.parteDe(usuario, { recicladorId: fila.reciclador_id, compradorId: fila.comprador_id })
      : null;
    if (!fila || !parte) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa operación.', 404);
    if (exigida && parte !== exigida) {
      throw new ErrorNegocio(
        'SIN_PERMISO',
        exigida === 'RECICLADOR' ? 'Esta acción es del reciclador.' : 'Esta acción es del negocio.',
        403,
      );
    }
    return fila;
  }

  private parteDe(usuario: UsuarioSesion, operacion: { recicladorId: string; compradorId: string }): Parte | null {
    if (operacion.recicladorId === usuario.id) return 'RECICLADOR';
    if (usuario.compradorId && operacion.compradorId === usuario.compradorId) return 'NEGOCIO';
    return null;
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
