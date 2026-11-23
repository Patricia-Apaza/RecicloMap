import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { type SolicitudPlanDatos } from '@reciclomap/shared';
import { Prisma } from '../../generado/prisma/client.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { numeroParametro } from '../juego/progreso.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { dia, diasHasta, proVigente } from './plan.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

const ENLACE_NEGOCIO = '/negocio/plan';
const fechaTexto = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const BENEFICIOS_PRO = [
  'Estadísticas ampliadas: 90 días, horas con más visitas y materiales más consultados',
  'Etiqueta «Destacado · Plan Pro» en el orden Recomendado',
  'Una ventaja limitada en el orden Recomendado; los demás órdenes no cambian',
] as const;

// El negocio ve su plan, pide Pro y lo cancela; el vencimiento es automático y en hora de Lima
@Injectable()
export class PlanService {
  private readonly registro = new Logger('Plan');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private compradorId(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_PERMISO', 'Esta sección es para negocios.', 403);
    return usuario.compradorId;
  }

  // Quién puede pedir Pro: negocio verificado y activo, sin otra solicitud y sin plan vigente (salvo por vencer)
  private async impedimento(compradorId: string): Promise<{ codigo: string; mensaje: string } | null> {
    const negocio = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: {
        plan: true,
        planDesde: true,
        planHasta: true,
        estadoVerificacion: true,
        usuario: { select: { estado: true } },
      },
    });
    if (negocio.usuario.estado === 'SUSPENDIDO') {
      return { codigo: 'CUENTA_SUSPENDIDA', mensaje: 'Tu cuenta está suspendida: no puedes pedir el plan Pro.' };
    }
    if (negocio.estadoVerificacion !== 'APROBADO') {
      return {
        codigo: 'NEGOCIO_NO_VERIFICADO',
        mensaje: 'Podrás pedir el plan Pro cuando tu negocio esté verificado.',
      };
    }
    if (await this.prisma.solicitudPlan.count({ where: { compradorId, estado: 'PENDIENTE' } })) {
      return {
        codigo: 'SOLICITUD_PENDIENTE',
        mensaje: 'Ya tienes una solicitud en revisión. Puedes cancelarla si quieres cambiarla.',
      };
    }
    const hasta = dia(negocio.planHasta);
    if (proVigente(negocio) && hasta) {
      const aviso = await numeroParametro(this.prisma, 'plan_aviso_vence_dias', 7);
      if (diasHasta(hasta) > aviso) {
        return {
          codigo: 'PLAN_VIGENTE',
          mensaje: 'Tu plan Pro sigue vigente. Podrás renovarlo cuando falte poco para su fin.',
        };
      }
    }
    return null;
  }

  async estado(usuario: UsuarioSesion) {
    const compradorId = this.compradorId(usuario);
    const hoy = hoyEnLima();
    const [negocio, solicitud, historial, solicitudes, aviso, impedimento] = await Promise.all([
      this.prisma.comprador.findUniqueOrThrow({
        where: { id: compradorId },
        select: { plan: true, planDesde: true, planHasta: true },
      }),
      this.prisma.solicitudPlan.findFirst({ where: { compradorId, estado: 'PENDIENTE' } }),
      this.prisma.planHistorial.findMany({
        where: { compradorId },
        orderBy: { creadoEn: 'desc' },
        take: 10,
        select: { id: true, accion: true, desde: true, hasta: true, creadoEn: true },
      }),
      this.prisma.solicitudPlan.findMany({
        where: { compradorId, estado: { not: 'PENDIENTE' } },
        orderBy: { creadaEn: 'desc' },
        take: 5,
        select: { id: true, estado: true, creadaEn: true, atendidaEn: true, motivoDecision: true },
      }),
      numeroParametro(this.prisma, 'plan_aviso_vence_dias', 7),
      this.impedimento(compradorId),
    ]);
    const vigente = proVigente(negocio, hoy);
    const hasta = dia(negocio.planHasta);
    return {
      plan: vigente ? ('PRO' as const) : ('GRATIS' as const),
      estado: vigente ? ('PRO' as const) : solicitud ? ('SOLICITADO' as const) : ('GRATIS' as const),
      desde: vigente ? dia(negocio.planDesde) : null,
      hasta: vigente ? hasta : null,
      venceEnDias: vigente && hasta ? diasHasta(hasta, hoy) : null,
      avisoVenceDias: aviso,
      solicitud: solicitud ? { id: solicitud.id, mensaje: solicitud.mensaje, creadaEn: solicitud.creadaEn } : null,
      puedeSolicitar: impedimento === null,
      impedimento,
      beneficios: BENEFICIOS_PRO,
      historial: historial.map((h) => ({
        id: h.id,
        accion: h.accion,
        desde: dia(h.desde),
        hasta: dia(h.hasta),
        fecha: h.creadoEn,
      })),
      solicitudes,
    };
  }

  async solicitar(usuario: UsuarioSesion, datos: SolicitudPlanDatos) {
    const compradorId = this.compradorId(usuario);
    const impedimento = await this.impedimento(compradorId);
    if (impedimento) {
      const estado =
        impedimento.codigo === 'CUENTA_SUSPENDIDA' || impedimento.codigo === 'NEGOCIO_NO_VERIFICADO' ? 403 : 409;
      throw new ErrorNegocio(impedimento.codigo, impedimento.mensaje, estado);
    }
    try {
      const solicitud = await this.prisma.$transaction(async (tx) => {
        const creada = await tx.solicitudPlan.create({ data: { compradorId, mensaje: datos.mensaje ?? null } });
        const negocio = await tx.comprador.findUniqueOrThrow({
          where: { id: compradorId },
          select: { nombreComercial: true },
        });
        await this.notificaciones.crear(tx, {
          usuarioId: usuario.id,
          tipo: 'PLAN',
          titulo: 'Recibimos tu solicitud del plan Pro',
          mensaje: 'La administración la revisará y te avisaremos aquí. Puedes cancelarla mientras esté en revisión.',
          enlace: ENLACE_NEGOCIO,
          obligatoria: true,
        });
        await this.avisarAdministracion(tx, negocio.nombreComercial);
        return creada;
      });
      return { id: solicitud.id, estado: solicitud.estado, mensaje: solicitud.mensaje, creadaEn: solicitud.creadaEn };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ErrorNegocio('SOLICITUD_PENDIENTE', 'Ya tienes una solicitud en revisión.', 409);
      }
      throw error;
    }
  }

  private async avisarAdministracion(tx: ClienteBd, negocio: string): Promise<void> {
    const administradores = await tx.usuario.findMany({
      where: { rol: 'ADMIN', estado: 'ACTIVO' },
      select: { id: true },
    });
    for (const { id } of administradores) {
      await this.notificaciones.crear(tx, {
        usuarioId: id,
        tipo: 'PLAN',
        titulo: 'Nueva solicitud del plan Pro',
        mensaje: `${negocio} pidió el plan Pro. Revísala en la cola de planes.`,
        enlace: '/admin/plan',
        obligatoria: true,
      });
    }
  }

  async cancelar(usuario: UsuarioSesion): Promise<void> {
    const compradorId = this.compradorId(usuario);
    const cambio = await this.prisma.solicitudPlan.updateMany({
      where: { compradorId, estado: 'PENDIENTE' },
      data: { estado: 'CANCELADA' },
    });
    if (cambio.count === 0) throw new ErrorNegocio('NO_ENCONTRADO', 'No tienes una solicitud en revisión.', 404);
  }

  // Al terminar la fecha de fin (hora de Lima) el negocio vuelve a Gratis, sin perder datos ni recibir penalización
  async vencerPlanes(): Promise<number> {
    const hoy = hoyEnLima();
    const vencidos = await this.prisma.comprador.findMany({
      where: { plan: 'PRO', planHasta: { lt: new Date(`${hoy}T00:00:00Z`) } },
      select: { id: true, usuarioId: true, planDesde: true, planHasta: true },
    });
    let cuantos = 0;
    for (const negocio of vencidos) {
      const hecho = await this.prisma.$transaction(async (tx) => {
        const cambio = await tx.comprador.updateMany({
          where: { id: negocio.id, plan: 'PRO', planHasta: { lt: new Date(`${hoy}T00:00:00Z`) } },
          data: { plan: 'GRATIS' },
        });
        if (cambio.count === 0) return false;
        await tx.planHistorial.create({
          data: {
            compradorId: negocio.id,
            accion: 'VENCIDO',
            desde: negocio.planDesde,
            hasta: negocio.planHasta,
            motivo: 'Terminó la fecha de fin del plan',
          },
        });
        await this.notificaciones.crear(tx, {
          usuarioId: negocio.usuarioId,
          tipo: 'PLAN',
          titulo: 'Tu plan Pro venció',
          mensaje: 'Vuelves al plan Gratis. No perdiste ningún dato; puedes pedir el plan Pro otra vez cuando quieras.',
          enlace: ENLACE_NEGOCIO,
          obligatoria: true,
        });
        return true;
      });
      if (hecho) cuantos += 1;
    }
    return cuantos;
  }

  // Avisa una sola vez de un plan por vencer
  async avisarPorVencer(): Promise<number> {
    const hoy = hoyEnLima();
    const dias = await numeroParametro(this.prisma, 'plan_aviso_vence_dias', 7);
    const limite = new Date(`${hoy}T00:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() + dias);
    const candidatos = await this.prisma.comprador.findMany({
      where: { plan: 'PRO', planAvisoEn: null, planHasta: { gte: new Date(`${hoy}T00:00:00Z`), lte: limite } },
      select: { id: true, usuarioId: true, planHasta: true },
    });
    let cuantos = 0;
    for (const negocio of candidatos) {
      const hasta = dia(negocio.planHasta);
      if (!hasta) continue;
      const marcado = await this.prisma.comprador.updateMany({
        where: { id: negocio.id, planAvisoEn: null },
        data: { planAvisoEn: new Date() },
      });
      if (marcado.count === 0) continue;
      const faltan = diasHasta(hasta, hoy);
      await this.notificaciones.crear(this.prisma, {
        usuarioId: negocio.usuarioId,
        tipo: 'PLAN',
        titulo:
          faltan === 0 ? 'Tu plan Pro vence hoy' : `Tu plan Pro vence en ${faltan} ${faltan === 1 ? 'día' : 'días'}`,
        mensaje: `Rige hasta el ${fechaTexto(hasta)}. Si quieres seguir, pide la renovación en Plan y avisos.`,
        enlace: ENLACE_NEGOCIO,
        obligatoria: true,
      });
      cuantos += 1;
    }
    return cuantos;
  }

  @Cron('*/30 * * * *', { name: 'plan-pro-vencimiento', timeZone: 'America/Lima' })
  async tareaDePlanes(): Promise<void> {
    if (enMantenimiento()) return;
    try {
      await this.vencerPlanes();
      await this.avisarPorVencer();
    } catch (error) {
      this.registro.error(`No se pudo revisar el vencimiento de los planes: ${String(error)}`);
    }
  }
}
