import { Injectable } from '@nestjs/common';
import type { VerificacionEstado } from '../../generado/prisma/enums.js';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { Mensajeria } from '../mensajeria/mensajeria.js';
import { smsDeDecision } from '../mensajeria/textos-sms.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

export type FiltroCola = 'pendientes' | 'info-pedida' | 'resueltas';

const ESTADOS_DE: Record<FiltroCola, VerificacionEstado[]> = {
  pendientes: ['EN_REVISION'],
  'info-pedida': ['INFO_PEDIDA'],
  resueltas: ['APROBADO', 'RECHAZADO'],
};

type Decision = {
  estado: Extract<VerificacionEstado, 'APROBADO' | 'RECHAZADO' | 'INFO_PEDIDA'>;
  accion: string;
  motivo?: string;
  mensaje?: string;
};

// Textos de la Fase 1: el aviso llega en la app y por SMS, nunca por WhatsApp
const AVISO: Record<Decision['estado'], (negocio: string) => { titulo: string; mensaje: string; sms: string }> = {
  APROBADO: (negocio) => ({
    titulo: 'Cuenta verificada',
    mensaje: 'Ya apareces en el mapa para los recicladores.',
    sms: smsDeDecision('APROBADO', negocio),
  }),
  RECHAZADO: (negocio) => ({
    titulo: 'Necesitamos corregir un dato',
    mensaje: 'No pudimos verificar tu negocio todavía. Revisa el motivo, corrige y vuelve a enviarlo.',
    sms: smsDeDecision('RECHAZADO', negocio),
  }),
  INFO_PEDIDA: (negocio) => ({
    titulo: 'Necesitamos más información',
    mensaje: 'Un administrador pidió completar un dato de tu negocio. Revisa el pedido y vuelve a enviarlo.',
    sms: smsDeDecision('INFO_PEDIDA', negocio),
  }),
};

// Usa la conexión de administración: solo puede leer precios, nunca cambiarlos
@Injectable()
export class VerificacionesService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
    private readonly mensajeria: Mensajeria,
  ) {}

  async cola(filtro: FiltroCola) {
    const [datos, conteos] = await Promise.all([
      this.prisma.verificacion.findMany({
        where: { estado: { in: ESTADOS_DE[filtro] } },
        orderBy: { creadaEn: filtro === 'resueltas' ? 'desc' : 'asc' },
        take: 50,
        select: {
          id: true,
          tipo: true,
          estado: true,
          motivo: true,
          cambios: true,
          creadaEn: true,
          resueltaEn: true,
          comprador: { select: { id: true, nombreComercial: true, tipo: true } },
        },
      }),
      this.prisma.verificacion.groupBy({ by: ['estado'], _count: { _all: true } }),
    ]);
    const cuenta = (estados: VerificacionEstado[]) =>
      conteos.filter((fila) => estados.includes(fila.estado)).reduce((suma, fila) => suma + fila._count._all, 0);
    return {
      datos,
      conteos: {
        pendientes: cuenta(ESTADOS_DE.pendientes),
        'info-pedida': cuenta(ESTADOS_DE['info-pedida']),
        resueltas: cuenta(ESTADOS_DE.resueltas),
      },
    };
  }

  async detalle(id: string) {
    const verificacion = await this.prisma.verificacion.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        estado: true,
        motivo: true,
        mensaje: true,
        cambios: true,
        creadaEn: true,
        resueltaEn: true,
        revisadoPor: { select: { nombre: true } },
        comprador: {
          select: {
            id: true,
            tipo: true,
            nombreComercial: true,
            descripcion: true,
            direccion: true,
            zona: { select: { nombre: true } },
            whatsapp: true,
            telefonoNegocio: true,
            vehiculo: true,
            horaInicio: true,
            horaFin: true,
            usuario: { select: { telefono: true, correo: true, creadoEn: true } },
            horarios: { select: { dia: true, abre: true, cierra: true }, orderBy: { dia: 'asc' } },
            pagos: { select: { metodo: true } },
            fotos: { select: { archivoId: true }, orderBy: { orden: 'asc' } },
            precios: {
              where: { activo: true },
              select: {
                material: { select: { codigo: true, nombre: true } },
                precioMin: true,
                precioMax: true,
                demanda: true,
              },
            },
          },
        },
      },
    });
    if (!verificacion) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa verificación.', 404);
    const { comprador } = verificacion;
    return {
      ...verificacion,
      cambioDireccion:
        verificacion.tipo === 'CAMBIO_DIRECCION'
          ? await this.compararDireccion(comprador.id, comprador, verificacion.cambios)
          : null,
      comprador: {
        ...comprador,
        horarios: comprador.horarios.map((fila) => ({
          dia: fila.dia,
          abre: fila.abre.toISOString().slice(11, 16),
          cierra: fila.cierra.toISOString().slice(11, 16),
        })),
        horaInicio: comprador.horaInicio?.toISOString().slice(11, 16) ?? null,
        horaFin: comprador.horaFin?.toISOString().slice(11, 16) ?? null,
        pagos: comprador.pagos.map((fila) => fila.metodo),
        fotos: comprador.fotos.map((fila) => fila.archivoId),
        // Solo lectura: el administrador no puede editar precios
        precios: comprador.precios.map((fila) => ({
          material: fila.material,
          min: fila.precioMin.toFixed(2),
          max: fila.precioMax.toFixed(2),
          demanda: fila.demanda,
        })),
      },
    };
  }

  aprobar(adminId: string, id: string) {
    return this.decidir(adminId, id, { estado: 'APROBADO', accion: 'APROBAR' });
  }

  rechazar(adminId: string, id: string, motivo: string, mensaje: string) {
    return this.decidir(adminId, id, { estado: 'RECHAZADO', accion: 'RECHAZAR', motivo, mensaje });
  }

  pedirInformacion(adminId: string, id: string, motivo: string, mensaje: string) {
    return this.decidir(adminId, id, { estado: 'INFO_PEDIDA', accion: 'PEDIR_INFORMACION', motivo, mensaje });
  }

  // Cambio, auditoría y aviso en una sola transacción; el SMS sale después
  private async decidir(adminId: string, id: string, decision: Decision) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.verificacion.findUnique({
        where: { id },
        select: {
          estado: true,
          tipo: true,
          cambios: true,
          comprador: {
            select: { id: true, nombreComercial: true, usuarioId: true, usuario: { select: { telefono: true } } },
          },
        },
      });
      if (!actual) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa verificación.', 404);
      const esCambio = actual.tipo === 'CAMBIO_DIRECCION';
      if (esCambio && decision.estado === 'INFO_PEDIDA') {
        throw new ErrorNegocio('DECISION_NO_VALIDA', 'Un cambio de dirección se aprueba o se rechaza con motivo.', 409);
      }

      const cambio = await tx.verificacion.updateMany({
        where: { id, estado: { in: ['EN_REVISION', 'INFO_PEDIDA'] } },
        data: {
          estado: decision.estado,
          motivo: decision.motivo ?? null,
          mensaje: decision.mensaje ?? null,
          revisadoPorId: adminId,
          resueltaEn: decision.estado === 'INFO_PEDIDA' ? null : new Date(),
        },
      });
      if (cambio.count === 0) {
        throw new ErrorNegocio('VERIFICACION_RESUELTA', 'Esta verificación ya fue resuelta.', 409);
      }

      const { comprador } = actual;
      if (!esCambio) {
        await tx.comprador.update({ where: { id: comprador.id }, data: { estadoVerificacion: decision.estado } });
      } else if (decision.estado === 'APROBADO') {
        await this.aplicarCambioDireccion(tx, comprador.id, actual.cambios);
      }
      await auditar(tx, {
        adminId,
        tipo: 'VERIFICACION',
        accion: esCambio ? `CAMBIO_DIRECCION_${decision.accion}` : decision.accion,
        entidad: 'verificacion',
        entidadId: id,
        motivo: decision.motivo,
        antes: { estado: actual.estado },
        despues: { estado: decision.estado, negocio: comprador.nombreComercial, mensaje: decision.mensaje ?? null },
      });
      // El cambio de dirección se avisa solo en la app: el negocio nunca dejó de estar visible
      if (esCambio) {
        const aprobado = decision.estado === 'APROBADO';
        await this.notificaciones.crear(tx, {
          usuarioId: comprador.usuarioId,
          tipo: 'AVISO',
          titulo: aprobado ? 'Aprobamos tu nueva dirección' : 'No aprobamos el cambio de dirección',
          mensaje: aprobado
            ? 'Los recicladores ya ven tu nueva dirección en el mapa.'
            : `Sigues visible con tu dirección anterior. Motivo: ${decision.motivo ?? ''}`.slice(0, 200),
          enlace: '/negocio/datos',
          obligatoria: true,
        });
        return null;
      }
      const aviso = AVISO[decision.estado](comprador.nombreComercial);
      await this.notificaciones.crear(tx, {
        usuarioId: comprador.usuarioId,
        tipo: 'AVISO',
        titulo: aviso.titulo,
        mensaje: decision.motivo ? `${aviso.mensaje} Motivo: ${decision.motivo}.`.slice(0, 200) : aviso.mensaje,
        enlace: '/negocio/verificacion',
        obligatoria: true,
      });
      return { telefono: comprador.usuario.telefono, sms: aviso.sms };
    });
    if (resultado) await this.mensajeria.enviarSms(resultado.telefono, resultado.sms);
    return this.detalle(id);
  }

  // Dirección vigente frente a la propuesta; el negocio sigue visible con la vigente hasta que se apruebe
  private async compararDireccion(
    compradorId: string,
    comprador: { direccion: string | null; zona: { nombre: string } | null },
    cambios: unknown,
  ) {
    const propuesta = cambios as {
      direccion: string;
      zonaId: number;
      ubicacion: { lat: number; lng: number } | null;
    } | null;
    const [pin] = await this.prisma.$queryRaw<Array<{ lat: number | null; lng: number | null }>>`
      SELECT ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lng FROM comprador WHERE id = ${compradorId}::uuid`;
    const zona = propuesta
      ? await this.prisma.zona.findUnique({ where: { id: propuesta.zonaId }, select: { nombre: true } })
      : null;
    return {
      vigente: {
        direccion: comprador.direccion,
        zona: comprador.zona?.nombre ?? null,
        pin: pin?.lat != null && pin.lng != null ? { lat: pin.lat, lng: pin.lng } : null,
      },
      propuesta: propuesta
        ? { direccion: propuesta.direccion, zona: zona?.nombre ?? null, pin: propuesta.ubicacion }
        : null,
    };
  }

  // Aplica la dirección, la zona y el pin aprobados; el administrador no escribe otros datos del negocio
  private async aplicarCambioDireccion(tx: ClienteBd, compradorId: string, cambios: unknown): Promise<void> {
    const datos = cambios as { direccion: string; zonaId: number; ubicacion: { lat: number; lng: number } | null };
    const lat = datos.ubicacion?.lat ?? null;
    const lng = datos.ubicacion?.lng ?? null;
    await tx.$executeRaw`
      UPDATE comprador SET
        direccion = ${datos.direccion},
        zona_id = ${datos.zonaId},
        ubicacion = CASE
          WHEN ${lat}::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
          WHEN NOT ubicacion_confirmada THEN (SELECT centro FROM zona WHERE id = ${datos.zonaId})
          ELSE ubicacion
        END,
        ubicacion_confirmada = ubicacion_confirmada OR ${lat !== null},
        actualizado_en = now()
      WHERE id = ${compradorId}::uuid`;
  }
}
