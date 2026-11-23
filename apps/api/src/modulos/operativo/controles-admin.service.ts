import { Injectable } from '@nestjs/common';
import type { esquemaBanner, esquemaMantenimiento, esquemaRegistroAbierto } from '@reciclomap/shared';
import type { z } from 'zod';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { OperativoService } from './operativo.service.js';

// Cada cambio lleva su motivo y se audita en la misma transacción; la base rechaza el cambio si falta la constancia
@Injectable()
export class ControlesAdminService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly operativo: OperativoService,
  ) {}

  async resumen() {
    const [c, recientes, intervalos, riesgo] = await Promise.all([
      this.prisma.controlOperativo.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.auditoria.findMany({
        where: { tipo: 'CONFIGURACION', entidad: 'control_operativo' },
        orderBy: { id: 'desc' },
        take: 10,
        select: { accion: true, motivo: true, creadaEn: true, despues: true, admin: { select: { nombre: true } } },
      }),
      this.prisma.mantenimientoIntervalo.findMany({ orderBy: { desde: 'desc' }, take: 5 }),
      this.avisosDeMantenimiento(),
    ]);
    return {
      banner: { texto: c.bannerTexto, desde: c.bannerDesde, hasta: c.bannerHasta },
      registro: { reciclador: c.registroRecicladorAbierto, negocio: c.registroNegocioAbierto },
      mantenimiento: { activo: c.mantenimientoActivo, mensaje: c.mantenimientoMensaje, desde: c.mantenimientoDesde },
      advertenciasMantenimiento: riesgo,
      recientes: recientes.map((r) => ({
        accion: r.accion,
        motivo: r.motivo,
        cuando: r.creadaEn,
        administrador: r.admin.nombre,
        detalle: r.despues,
      })),
      mantenimientos: intervalos.map((i) => ({
        desde: i.desde,
        hasta: i.hasta,
        plazosDevueltos: i.extendidoEn !== null,
      })),
    };
  }

  // El cambio de mes y el vencimiento de los planes Pro no se corren durante un mantenimiento: se avisa si están a menos de 24 h
  private async avisosDeMantenimiento() {
    const filas = await this.prisma.$queryRaw<Array<{ mes_en_horas: number; planes: number }>>`
      SELECT (extract(epoch FROM (date_trunc('month', now() AT TIME ZONE 'America/Lima') + interval '1 month')
                - (now() AT TIME ZONE 'America/Lima')) / 3600.0)::float8 AS mes_en_horas,
             (SELECT count(*)::int FROM "comprador"
               WHERE "plan" = 'PRO' AND "plan_hasta" IS NOT NULL
                 AND "plan_hasta" = (now() AT TIME ZONE 'America/Lima')::date) AS planes`;
    const f = filas[0];
    return {
      cambioDeMesEn24h: (f?.mes_en_horas ?? 999) <= 24,
      planesQueVencenEn24h: f?.planes ?? 0,
    };
  }

  async banner(adminId: string, datos: z.infer<typeof esquemaBanner>) {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.controlOperativo.findUniqueOrThrow({ where: { id: 1 } });
      await tx.controlOperativo.update({
        where: { id: 1 },
        data: {
          bannerTexto: datos.texto,
          bannerDesde: datos.texto ? new Date(datos.desde!) : null,
          bannerHasta: datos.texto ? new Date(datos.hasta!) : null,
          bannerVersion: { increment: 1 },
          actualizadoEn: new Date(),
        },
      });
      await auditar(tx, {
        adminId,
        tipo: 'CONFIGURACION',
        accion: 'BANNER',
        entidad: 'control_operativo',
        entidadId: '1',
        motivo: datos.motivo,
        antes: { texto: antes.bannerTexto },
        despues: { texto: datos.texto, desde: datos.desde ?? null, hasta: datos.hasta ?? null },
      });
    });
    await this.operativo.refrescar();
    return this.resumen();
  }

  async registro(adminId: string, datos: z.infer<typeof esquemaRegistroAbierto>) {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.controlOperativo.findUniqueOrThrow({ where: { id: 1 } });
      await tx.controlOperativo.update({
        where: { id: 1 },
        data: {
          ...(datos.reciclador !== undefined ? { registroRecicladorAbierto: datos.reciclador } : {}),
          ...(datos.negocio !== undefined ? { registroNegocioAbierto: datos.negocio } : {}),
          actualizadoEn: new Date(),
        },
      });
      await auditar(tx, {
        adminId,
        tipo: 'CONFIGURACION',
        accion: 'REGISTRO',
        entidad: 'control_operativo',
        entidadId: '1',
        motivo: datos.motivo,
        antes: { reciclador: antes.registroRecicladorAbierto, negocio: antes.registroNegocioAbierto },
        despues: {
          reciclador: datos.reciclador ?? antes.registroRecicladorAbierto,
          negocio: datos.negocio ?? antes.registroNegocioAbierto,
        },
      });
    });
    await this.operativo.refrescar();
    return this.resumen();
  }

  async mantenimiento(adminId: string, datos: z.infer<typeof esquemaMantenimiento>) {
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.controlOperativo.findUniqueOrThrow({ where: { id: 1 } });
      if (antes.mantenimientoActivo === datos.activo) {
        throw new ErrorNegocio(
          datos.activo ? 'MANTENIMIENTO_YA_ACTIVO' : 'MANTENIMIENTO_NO_ACTIVO',
          datos.activo ? 'El mantenimiento ya está activo.' : 'El mantenimiento no está activo.',
          409,
        );
      }
      await tx.controlOperativo.update({
        where: { id: 1 },
        data: {
          mantenimientoActivo: datos.activo,
          mantenimientoMensaje: datos.activo ? datos.mensaje! : null,
          actualizadoEn: new Date(),
        },
      });
      await auditar(tx, {
        adminId,
        tipo: 'CONFIGURACION',
        accion: 'MANTENIMIENTO',
        entidad: 'control_operativo',
        entidadId: '1',
        motivo: datos.motivo,
        antes: { activo: antes.mantenimientoActivo },
        despues: { activo: datos.activo, mensaje: datos.mensaje ?? null },
      });
    });
    await this.operativo.refrescar();
    return this.resumen();
  }
}
