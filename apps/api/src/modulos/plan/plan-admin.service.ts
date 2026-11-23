import { Injectable } from '@nestjs/common';
import type { ActivarPlan } from '@reciclomap/shared';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { dia, proVigente } from './plan.js';

const ENLACE_NEGOCIO = '/negocio/plan';
const fechaTexto = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

// La administración solo decide el plan y sus fechas, siempre con motivo y auditoría; nada más del negocio cambia
@Injectable()
export class PlanAdminService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private vista(n: {
    id: string;
    nombreComercial: string;
    tipo: string;
    estadoVerificacion: string;
    plan: string;
    planDesde: Date | null;
    planHasta: Date | null;
    usuario: { estado: string };
  }) {
    return {
      id: n.id,
      nombre: n.nombreComercial,
      tipo: n.tipo,
      verificado: n.estadoVerificacion === 'APROBADO',
      suspendido: n.usuario.estado === 'SUSPENDIDO',
      plan: proVigente(n) ? ('PRO' as const) : ('GRATIS' as const),
      desde: dia(n.planDesde),
      hasta: dia(n.planHasta),
    };
  }

  async cola(filtro: 'pendientes' | 'resueltas') {
    const filas = await this.prisma.solicitudPlan.findMany({
      where: { estado: filtro === 'pendientes' ? 'PENDIENTE' : { not: 'PENDIENTE' } },
      orderBy: { creadaEn: filtro === 'pendientes' ? 'asc' : 'desc' },
      take: 50,
      include: { comprador: { include: { usuario: { select: { estado: true } } } } },
    });
    return {
      datos: filas.map((s) => ({
        id: s.id,
        estado: s.estado,
        mensaje: s.mensaje,
        creadaEn: s.creadaEn,
        atendidaEn: s.atendidaEn,
        motivoDecision: s.motivoDecision,
        desde: dia(s.desde),
        hasta: dia(s.hasta),
        negocio: this.vista(s.comprador),
      })),
    };
  }

  async negocios(busqueda?: string) {
    const filas = await this.prisma.comprador.findMany({
      where: {
        estadoVerificacion: 'APROBADO',
        ...(busqueda ? { nombreComercial: { contains: busqueda, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { nombreComercial: 'asc' },
      take: 30,
      include: { usuario: { select: { estado: true } } },
    });
    return { datos: filas.map((n) => this.vista(n)) };
  }

  async historial(compradorId: string) {
    const filas = await this.prisma.planHistorial.findMany({
      where: { compradorId },
      orderBy: { creadoEn: 'desc' },
      take: 20,
    });
    return {
      datos: filas.map((h) => ({
        id: h.id,
        accion: h.accion,
        desde: dia(h.desde),
        hasta: dia(h.hasta),
        motivo: h.motivo,
        porAdministracion: h.adminId !== null,
        fecha: h.creadoEn,
      })),
    };
  }

  private async negocio(tx: ClienteBd, compradorId: string) {
    const negocio = await tx.comprador.findUnique({
      where: { id: compradorId },
      select: {
        id: true,
        usuarioId: true,
        nombreComercial: true,
        tipo: true,
        plan: true,
        planDesde: true,
        planHasta: true,
        estadoVerificacion: true,
        usuario: { select: { estado: true } },
      },
    });
    if (!negocio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio.', 404);
    return negocio;
  }

  private validarFechas(datos: ActivarPlan) {
    if (datos.hasta < hoyEnLima()) {
      throw new ErrorNegocio('FECHA_NO_VALIDA', 'La fecha de fin ya pasó.', 422, [
        { campo: 'hasta', mensaje: 'Elige una fecha de fin de hoy en adelante.' },
      ]);
    }
  }

  // Deja el plan activo con sus fechas, el historial y la auditoría en una sola operación
  private async activarEn(
    tx: ClienteBd,
    adminId: string,
    compradorId: string,
    datos: ActivarPlan,
    solicitudId: string | null,
  ) {
    const negocio = await this.negocio(tx, compradorId);
    if (negocio.estadoVerificacion !== 'APROBADO') {
      throw new ErrorNegocio('NEGOCIO_NO_VERIFICADO', 'Solo un negocio verificado puede tener el plan Pro.', 409);
    }
    if (negocio.usuario.estado === 'SUSPENDIDO') {
      throw new ErrorNegocio('CUENTA_SUSPENDIDA', 'La cuenta del negocio está suspendida.', 409);
    }
    await tx.comprador.update({
      where: { id: compradorId },
      data: {
        plan: 'PRO',
        planDesde: new Date(`${datos.desde}T00:00:00Z`),
        planHasta: new Date(`${datos.hasta}T00:00:00Z`),
        planAvisoEn: null,
      },
    });
    await tx.planHistorial.create({
      data: {
        compradorId,
        accion: 'ACTIVADO',
        desde: new Date(`${datos.desde}T00:00:00Z`),
        hasta: new Date(`${datos.hasta}T00:00:00Z`),
        motivo: datos.motivo,
        adminId,
        solicitudId,
      },
    });
    await auditar(tx, {
      adminId,
      tipo: 'PLAN',
      accion: solicitudId ? 'APROBAR_SOLICITUD_PRO' : 'ACTIVAR_PRO',
      entidad: 'comprador',
      entidadId: compradorId,
      motivo: datos.motivo,
      antes: { plan: negocio.plan, desde: dia(negocio.planDesde), hasta: dia(negocio.planHasta) },
      despues: { plan: 'PRO', desde: datos.desde, hasta: datos.hasta },
    });
    await this.notificaciones.crear(tx, {
      usuarioId: negocio.usuarioId,
      tipo: 'PLAN',
      titulo: 'Tu plan Pro está activo',
      mensaje: `Rige del ${fechaTexto(datos.desde)} al ${fechaTexto(datos.hasta)}.`,
      enlace: ENLACE_NEGOCIO,
      obligatoria: true,
    });
    return negocio;
  }

  async aprobar(adminId: string, solicitudId: string, datos: ActivarPlan) {
    this.validarFechas(datos);
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPlan.findUnique({ where: { id: solicitudId } });
      if (!solicitud) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa solicitud.', 404);
      const cambio = await tx.solicitudPlan.updateMany({
        where: { id: solicitudId, estado: 'PENDIENTE' },
        data: {
          estado: 'APROBADA',
          decididaPorId: adminId,
          motivoDecision: datos.motivo,
          desde: new Date(`${datos.desde}T00:00:00Z`),
          hasta: new Date(`${datos.hasta}T00:00:00Z`),
        },
      });
      if (cambio.count === 0) {
        throw new ErrorNegocio('SOLICITUD_YA_RESUELTA', 'Esta solicitud ya fue resuelta o cancelada.', 409);
      }
      await this.activarEn(tx, adminId, solicitud.compradorId, datos, solicitudId);
      return { id: solicitudId, estado: 'APROBADA' as const, desde: datos.desde, hasta: datos.hasta };
    });
  }

  async rechazar(adminId: string, solicitudId: string, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPlan.findUnique({ where: { id: solicitudId } });
      if (!solicitud) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa solicitud.', 404);
      const cambio = await tx.solicitudPlan.updateMany({
        where: { id: solicitudId, estado: 'PENDIENTE' },
        data: { estado: 'RECHAZADA', decididaPorId: adminId, motivoDecision: motivo },
      });
      if (cambio.count === 0) {
        throw new ErrorNegocio('SOLICITUD_YA_RESUELTA', 'Esta solicitud ya fue resuelta o cancelada.', 409);
      }
      const negocio = await this.negocio(tx, solicitud.compradorId);
      await auditar(tx, {
        adminId,
        tipo: 'PLAN',
        accion: 'RECHAZAR_SOLICITUD_PRO',
        entidad: 'solicitud_plan',
        entidadId: solicitudId,
        motivo,
        antes: { estado: 'PENDIENTE' },
        despues: { estado: 'RECHAZADA', negocio: negocio.nombreComercial },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: negocio.usuarioId,
        tipo: 'PLAN',
        titulo: 'No aprobamos tu solicitud del plan Pro',
        mensaje: `Motivo: ${motivo}`,
        enlace: ENLACE_NEGOCIO,
        obligatoria: true,
      });
      return { id: solicitudId, estado: 'RECHAZADA' as const };
    });
  }

  // La administración activa Pro por su cuenta; una solicitud pendiente del negocio queda aprobada con esas fechas
  async activar(adminId: string, compradorId: string, datos: ActivarPlan) {
    this.validarFechas(datos);
    return this.prisma.$transaction(async (tx) => {
      const pendiente = await tx.solicitudPlan.findFirst({ where: { compradorId, estado: 'PENDIENTE' } });
      if (pendiente) {
        await tx.solicitudPlan.updateMany({
          where: { id: pendiente.id, estado: 'PENDIENTE' },
          data: {
            estado: 'APROBADA',
            decididaPorId: adminId,
            motivoDecision: datos.motivo,
            desde: new Date(`${datos.desde}T00:00:00Z`),
            hasta: new Date(`${datos.hasta}T00:00:00Z`),
          },
        });
      }
      await this.activarEn(tx, adminId, compradorId, datos, pendiente?.id ?? null);
      return { id: compradorId, plan: 'PRO' as const, desde: datos.desde, hasta: datos.hasta };
    });
  }

  async desactivar(adminId: string, compradorId: string, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      const negocio = await this.negocio(tx, compradorId);
      if (negocio.plan !== 'PRO')
        throw new ErrorNegocio('PLAN_NO_ACTIVO', 'Este negocio ya está en el plan Gratis.', 409);
      await tx.comprador.update({ where: { id: compradorId }, data: { plan: 'GRATIS', planAvisoEn: null } });
      await tx.planHistorial.create({
        data: {
          compradorId,
          accion: 'DESACTIVADO',
          desde: negocio.planDesde,
          hasta: negocio.planHasta,
          motivo,
          adminId,
        },
      });
      await auditar(tx, {
        adminId,
        tipo: 'PLAN',
        accion: 'DESACTIVAR_PRO',
        entidad: 'comprador',
        entidadId: compradorId,
        motivo,
        antes: { plan: 'PRO', desde: dia(negocio.planDesde), hasta: dia(negocio.planHasta) },
        despues: { plan: 'GRATIS' },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: negocio.usuarioId,
        tipo: 'PLAN',
        titulo: 'Tu plan Pro fue desactivado',
        mensaje: 'Vuelves al plan Gratis. No perdiste ningún dato.',
        enlace: ENLACE_NEGOCIO,
        obligatoria: true,
      });
      return { id: compradorId, plan: 'GRATIS' as const };
    });
  }
}
