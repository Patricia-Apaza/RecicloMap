import { Injectable } from '@nestjs/common';
import type { EntregaDirecta } from '@reciclomap/shared';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../generado/prisma/client.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { hoyEnLima, sumarDias } from '../estadisticas/fechas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { otorgarGiros } from '../operaciones/cierre.js';
import { nombreCorto } from '../publicaciones/textos.js';
import { numeroParametro, ProgresoService } from './progreso.service.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

const DIAS_ATRAS_MAXIMOS = 7;
const kilos = (kg: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(kg);
const numero = (valor: { toString(): string } | null | undefined) => Number(valor ?? 0);

type FilaEntrega = {
  id: string;
  estado: string;
  reciclador_id: string;
  comprador_id: string;
  vence_en: Date;
};

const seleccion = {
  id: true,
  estado: true,
  kg: true,
  kgConfirmado: true,
  fecha: true,
  puntosOtorgados: true,
  motivoRechazo: true,
  creadoEn: true,
  resueltoEn: true,
  venceEn: true,
  material: { select: { codigo: true, nombre: true } },
  comprador: { select: { nombreComercial: true } },
  reciclador: { select: { nombre: true, perfilReciclador: { select: { nivel: { select: { nombre: true } } } } } },
} satisfies Prisma.RegistroReciclajeSelect;

type Entrega = Prisma.RegistroReciclajeGetPayload<{ select: typeof seleccion }>;

// RN-15: el reciclador registra lo que entregó sin publicación previa y el negocio lo confirma con los kilos que recibió
@Injectable()
export class EntregasService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
    private readonly progreso: ProgresoService,
  ) {}

  private vista(fila: Entrega, para: 'RECICLADOR' | 'NEGOCIO') {
    return {
      id: fila.id,
      estado: fila.estado,
      material: fila.material,
      kg: numero(fila.kg),
      kgConfirmado: fila.kgConfirmado === null ? null : numero(fila.kgConfirmado),
      fecha: fila.fecha.toISOString().slice(0, 10),
      creadoEn: fila.creadoEn,
      venceEn: fila.venceEn,
      ...(para === 'RECICLADOR'
        ? {
            negocio: fila.comprador.nombreComercial,
            puntosOtorgados: fila.puntosOtorgados,
            motivoRechazo: fila.motivoRechazo,
          }
        : {
            reciclador: nombreCorto(fila.reciclador.nombre),
            nivel: fila.reciclador.perfilReciclador?.nivel.nombre ?? null,
          }),
    };
  }

  private async negocioDe(usuario: UsuarioSesion) {
    const comprador = await this.prisma.comprador.findUnique({
      where: { usuarioId: usuario.id },
      select: { id: true, nombreComercial: true, usuarioId: true },
    });
    if (!comprador) throw new ErrorNegocio('SIN_PERMISO', 'Esta acción es de un negocio.', 403);
    return comprador;
  }

  // Un registro pendiente vence a los 7 días sin dar puntos; se revisa al consultar y cada hora
  async vencerPendientes(ahora: Date = new Date(), recicladorId?: string): Promise<number> {
    const vencidas = await this.prisma.registroReciclaje.findMany({
      where: { estado: 'PENDIENTE', venceEn: { lte: ahora }, ...(recicladorId ? { recicladorId } : {}) },
      select: { id: true, recicladorId: true, kg: true, material: { select: { nombre: true } } },
    });
    let total = 0;
    for (const registro of vencidas) {
      const marcada = await this.prisma.registroReciclaje.updateMany({
        where: { id: registro.id, estado: 'PENDIENTE' },
        data: { estado: 'VENCIDO', resueltoEn: ahora },
      });
      if (marcada.count === 0) continue;
      total++;
      await this.notificaciones.crear(this.prisma, {
        usuarioId: registro.recicladorId,
        tipo: 'CONFIRMACION',
        titulo: 'Tu entrega directa venció',
        mensaje: `El negocio no confirmó los ${kilos(numero(registro.kg))} kg de ${registro.material.nombre} a tiempo, así que no suma puntos.`,
        enlace: '/puntos/entregas',
        obligatoria: true,
      });
    }
    return total;
  }

  @Cron('5 * * * *', { name: 'vencer-entregas-directas', timeZone: 'America/Lima' })
  async tareaVencer(): Promise<void> {
    if (enMantenimiento()) return;
    await this.vencerPendientes();
  }

  private async limites() {
    const [tope, maxPendientes, vigenciaDias] = await Promise.all([
      numeroParametro(this.prisma, 'tope_diario_registro_directo', 150),
      numeroParametro(this.prisma, 'registro_directo_max_pendientes', 3),
      numeroParametro(this.prisma, 'registro_directo_vigencia_dias', 7),
    ]);
    return { tope, maxPendientes, vigenciaDias };
  }

  private puntosDeHoy(db: Prisma.TransactionClient | PrismaApi, recicladorId: string, ahora: Date) {
    const dia = hoyEnLima(ahora);
    return db.$queryRaw<Array<{ n: number }>>`
      SELECT COALESCE(sum(puntos), 0)::int AS n FROM movimiento_puntos
       WHERE usuario_id = ${recicladorId}::uuid AND motivo = 'REGISTRO_DIRECTO'
         AND (creado_en AT TIME ZONE 'America/Lima')::date = ${dia}::date`;
  }

  async registrar(usuario: UsuarioSesion, datos: EntregaDirecta) {
    const ahora = new Date();
    await this.vencerPendientes(ahora, usuario.id);
    const hoy = hoyEnLima(ahora);
    const fecha = datos.fecha ?? hoy;
    if (fecha > hoy || fecha < sumarDias(hoy, -DIAS_ATRAS_MAXIMOS)) {
      throw new ErrorNegocio('FECHA_NO_VALIDA', `La fecha debe ser de los últimos ${DIAS_ATRAS_MAXIMOS} días.`, 422, [
        { campo: 'fecha', mensaje: `Elige una fecha de los últimos ${DIAS_ATRAS_MAXIMOS} días.` },
      ]);
    }
    const [negocio, material, limites] = await Promise.all([
      this.prisma.comprador.findFirst({
        where: { id: datos.compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
        select: { id: true, nombreComercial: true, usuarioId: true },
      }),
      this.prisma.material.findUniqueOrThrow({ where: { codigo: datos.material }, select: { id: true, nombre: true } }),
      this.limites(),
    ]);
    if (!negocio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio.', 404);
    try {
      const creada = await this.prisma.$transaction(async (tx) => {
        // Evita pasar el máximo de pendientes con dos solicitudes a la vez
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`entrega:${usuario.id}`}, 0))`;
        const pendientes = await tx.registroReciclaje.count({
          where: { recicladorId: usuario.id, estado: 'PENDIENTE' },
        });
        if (pendientes >= limites.maxPendientes) {
          throw new ErrorNegocio(
            'LIMITE_PENDIENTES',
            `Ya tienes ${limites.maxPendientes} entregas por confirmar. Espera a que los negocios respondan.`,
            409,
          );
        }
        const registro = await tx.registroReciclaje.create({
          data: {
            recicladorId: usuario.id,
            compradorId: negocio.id,
            materialId: material.id,
            kg: datos.kg,
            fecha: new Date(`${fecha}T00:00:00Z`),
            venceEn: new Date(ahora.getTime() + limites.vigenciaDias * 86_400_000),
          },
          select: seleccion,
        });
        const quien = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { nombre: true } });
        await this.notificaciones.crear(tx, {
          usuarioId: negocio.usuarioId,
          tipo: 'CONFIRMACION',
          titulo: 'Entrega directa por confirmar',
          mensaje: `${nombreCorto(quien.nombre)} registró ${kilos(datos.kg)} kg de ${material.nombre}. Confirma los kilos que recibiste.`,
          enlace: '/negocio/entregas',
          obligatoria: true,
        });
        return registro;
      });
      return this.vista(creada, 'RECICLADOR');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ErrorNegocio(
          'ENTREGA_DUPLICADA',
          'Ya registraste una entrega de este material a este negocio ese día.',
          409,
        );
      }
      throw error;
    }
  }

  // Negocios verificados de la ciudad del reciclador: solo datos públicos, sin ubicación exacta
  async negocios(usuario: UsuarioSesion) {
    const reciclador = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { ciudadId: true },
    });
    const filas = await this.prisma.comprador.findMany({
      where: { estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO', ciudadId: reciclador.ciudadId } },
      orderBy: { nombreComercial: 'asc' },
      select: { id: true, nombreComercial: true, tipo: true, zona: { select: { nombre: true } } },
    });
    return {
      datos: filas.map((f) => ({ id: f.id, nombre: f.nombreComercial, tipo: f.tipo, zona: f.zona?.nombre ?? null })),
    };
  }

  async mias(usuario: UsuarioSesion) {
    const ahora = new Date();
    await this.vencerPendientes(ahora, usuario.id);
    const [filas, limites, hoy] = await Promise.all([
      this.prisma.registroReciclaje.findMany({
        where: { recicladorId: usuario.id },
        orderBy: { creadoEn: 'desc' },
        take: 30,
        select: seleccion,
      }),
      this.limites(),
      this.puntosDeHoy(this.prisma, usuario.id, ahora),
    ]);
    return {
      limites: {
        topeDiario: limites.tope,
        puntosHoy: hoy[0]?.n ?? 0,
        maxPendientes: limites.maxPendientes,
        pendientes: filas.filter((f) => f.estado === 'PENDIENTE').length,
        vigenciaDias: limites.vigenciaDias,
      },
      datos: filas.map((f) => this.vista(f, 'RECICLADOR')),
    };
  }

  async delNegocio(usuario: UsuarioSesion, filtro: 'pendientes' | 'todas') {
    const negocio = await this.negocioDe(usuario);
    await this.vencerPendientes(new Date());
    const filas = await this.prisma.registroReciclaje.findMany({
      where: { compradorId: negocio.id, ...(filtro === 'pendientes' ? { estado: 'PENDIENTE' } : {}) },
      orderBy: filtro === 'pendientes' ? { venceEn: 'asc' } : { creadoEn: 'desc' },
      take: 50,
      select: seleccion,
    });
    return { datos: filas.map((f) => this.vista(f, 'NEGOCIO')) };
  }

  private async bloquear(tx: Prisma.TransactionClient, id: string, compradorId: string): Promise<FilaEntrega> {
    const [fila] = await tx.$queryRaw<FilaEntrega[]>`
      SELECT id, estado::text AS estado, reciclador_id, comprador_id, vence_en
        FROM registro_reciclaje WHERE id = ${id}::uuid FOR UPDATE`;
    if (!fila || fila.comprador_id !== compradorId) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa entrega.', 404);
    }
    if (fila.estado !== 'PENDIENTE') {
      throw new ErrorNegocio('ENTREGA_YA_RESUELTA', 'Esta entrega ya fue resuelta.', 409);
    }
    return fila;
  }

  // El valor confirmado por el negocio es el que cuenta para nivel, racha y desafíos; los puntos respetan el tope diario
  async confirmar(usuario: UsuarioSesion, id: string, kg: number) {
    const negocio = await this.negocioDe(usuario);
    const ahora = new Date();
    const limites = await this.limites();
    const puntosPorKg = await numeroParametro(this.prisma, 'puntos_por_kg', 1);
    const puntosPorGiro = await numeroParametro(this.prisma, 'puntos_por_giro', 500);
    const resultado = await this.prisma.$transaction(async (tx) => {
      const fila = await this.bloquear(tx, id, negocio.id);
      if (fila.vence_en <= ahora) {
        await tx.registroReciclaje.update({ where: { id }, data: { estado: 'VENCIDO', resueltoEn: ahora } });
        return { vencida: true as const };
      }
      // Con la cuenta del reciclador suspendida no se confirman kilos ni se dan puntos; se rechaza o se deja vencer
      const reciclador = await tx.usuario.findUnique({ where: { id: fila.reciclador_id }, select: { estado: true } });
      if (reciclador?.estado === 'SUSPENDIDO') {
        throw new ErrorNegocio(
          'CONTRAPARTE_SUSPENDIDA',
          'La cuenta del reciclador está suspendida: no se pueden confirmar kilos. Puedes rechazar la entrega.',
          409,
        );
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tope:${fila.reciclador_id}`}, 0))`;
      const usados = (await this.puntosDeHoy(tx, fila.reciclador_id, ahora))[0]?.n ?? 0;
      const calculados = Math.floor(kg * puntosPorKg);
      const otorgados = Math.max(0, Math.min(calculados, limites.tope - usados));
      await tx.registroReciclaje.update({
        where: { id },
        data: { estado: 'CONFIRMADO', kgConfirmado: kg, resueltoEn: ahora, puntosOtorgados: otorgados },
      });
      if (otorgados > 0) {
        await tx.movimientoPuntos.create({
          data: {
            usuarioId: fila.reciclador_id,
            puntos: otorgados,
            motivo: 'REGISTRO_DIRECTO',
            cuentaParaGiros: true,
            registroId: id,
            creadoEn: ahora,
          },
        });
      }
      const antes = await tx.recicladorPerfil.findUniqueOrThrow({
        where: { usuarioId: fila.reciclador_id },
        select: { puntosReciclaje: true, nivelId: true },
      });
      const despues = await tx.recicladorPerfil.update({
        where: { usuarioId: fila.reciclador_id },
        data: {
          kgTotal: { increment: kg },
          puntos: { increment: otorgados },
          puntosReciclaje: { increment: otorgados },
        },
        select: { kgTotal: true, nivel: { select: { id: true, nombre: true } } },
      });
      const girosNuevos = await otorgarGiros(
        tx,
        fila.reciclador_id,
        antes.puntosReciclaje,
        antes.puntosReciclaje + otorgados,
        puntosPorGiro,
        ahora,
      );
      const detalle = await tx.registroReciclaje.findUniqueOrThrow({
        where: { id },
        select: { material: { select: { nombre: true } } },
      });
      return {
        vencida: false as const,
        recicladorId: fila.reciclador_id,
        material: detalle.material.nombre,
        otorgados,
        calculados,
        nivelSubio: despues.nivel.id !== antes.nivelId ? despues.nivel.nombre : null,
        kgTotal: numero(despues.kgTotal),
        girosNuevos,
      };
    });
    if (resultado.vencida) {
      throw new ErrorNegocio('ENTREGA_VENCIDA', 'Esta entrega venció sin confirmarse.', 409);
    }
    const tope = resultado.otorgados < resultado.calculados;
    await this.notificaciones.crear(this.prisma, {
      usuarioId: resultado.recicladorId,
      tipo: 'CONFIRMACION',
      titulo: 'Confirmaron tu entrega directa',
      mensaje: `${negocio.nombreComercial} confirmó ${kilos(kg)} kg de ${resultado.material}: +${resultado.otorgados} puntos${
        tope ? ' (llegaste al tope de puntos de hoy)' : ''
      }.`,
      enlace: '/puntos/entregas',
      obligatoria: true,
    });
    if (resultado.nivelSubio) {
      await this.progreso.avisarNivel(resultado.recicladorId, resultado.nivelSubio, resultado.kgTotal);
    }
    await this.progreso.avisarGiros(resultado.recicladorId, resultado.girosNuevos);
    await this.progreso.evaluar(resultado.recicladorId, { ahora });
    return { puntosOtorgados: resultado.otorgados, kgConfirmado: kg };
  }

  async rechazar(usuario: UsuarioSesion, id: string, motivo: string) {
    const negocio = await this.negocioDe(usuario);
    const ahora = new Date();
    const resultado = await this.prisma.$transaction(async (tx) => {
      const fila = await this.bloquear(tx, id, negocio.id);
      const detalle = await tx.registroReciclaje.update({
        where: { id },
        data: { estado: 'RECHAZADO', motivoRechazo: motivo, resueltoEn: ahora },
        select: { kg: true, material: { select: { nombre: true } } },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: fila.reciclador_id,
        tipo: 'CONFIRMACION',
        titulo: 'Rechazaron tu entrega directa',
        mensaje: `${negocio.nombreComercial} no confirmó los ${kilos(numero(detalle.kg))} kg de ${detalle.material.nombre}: ${motivo}`,
        enlace: '/puntos/entregas',
        obligatoria: true,
      });
      return { rechazada: true };
    });
    return resultado;
  }
}
