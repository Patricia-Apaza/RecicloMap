import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

// Plazos de corrección vencidos: avisan una vez a la administración; nunca suspenden ni cierran solos
@Injectable()
export class ReportesTareas {
  private readonly registro = new Logger('ReportesTareas');

  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('*/30 * * * *', { name: 'plazos-de-correccion' })
  async ejecutar(): Promise<void> {
    if (enMantenimiento()) return;
    const avisados = await this.avisarPlazosVencidos();
    if (avisados > 0) this.registro.log(`Plazos de corrección vencidos avisados: ${avisados}.`);
  }

  async avisarPlazosVencidos(ahora: Date = new Date()): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const precios = await tx.moderacionPrecio.findMany({
        where: { estado: 'CORRECCION_PEDIDA', cerradaEn: null, plazoHasta: { lt: ahora }, plazoAvisadoEn: null },
        select: {
          id: true,
          precioMaterial: {
            select: { material: { select: { nombre: true } }, comprador: { select: { nombreComercial: true } } },
          },
        },
      });
      const reportes = await tx.reporte.findMany({
        where: { estado: 'CORRECCION_PEDIDA', plazoHasta: { lt: ahora }, plazoAvisadoEn: null },
        select: {
          id: true,
          tipo: true,
          comprador: { select: { nombreComercial: true } },
          operacion: { select: { comprador: { select: { nombreComercial: true } } } },
        },
      });
      if (precios.length + reportes.length === 0) return 0;
      await tx.moderacionPrecio.updateMany({
        where: { id: { in: precios.map((p) => p.id) } },
        data: { plazoAvisadoEn: ahora },
      });
      await tx.reporte.updateMany({
        where: { id: { in: reportes.map((r) => r.id) } },
        data: { plazoAvisadoEn: ahora },
      });
      const admins = await tx.usuario.findMany({ where: { rol: 'ADMIN', estado: 'ACTIVO' }, select: { id: true } });
      const avisos = [
        ...precios.map((p) => ({
          titulo: 'Venció un plazo de corrección de precio',
          mensaje: `${p.precioMaterial.comprador.nombreComercial} · ${p.precioMaterial.material.nombre}. Decide qué hacer.`,
          enlace: '/admin/precios',
        })),
        ...reportes.map((r) => ({
          titulo: 'Venció un plazo de corrección',
          mensaje: `${r.comprador?.nombreComercial ?? r.operacion?.comprador.nombreComercial ?? 'Un negocio'} no corrigió a tiempo. Decide qué hacer.`,
          enlace: r.tipo === 'OPERACION' ? '/admin/incidencias' : '/admin/reportes',
        })),
      ];
      for (const admin of admins) {
        for (const aviso of avisos) {
          await this.notificaciones.crear(tx, { usuarioId: admin.id, tipo: 'AVISO', ...aviso, obligatoria: true });
        }
      }
      return avisos.length;
    });
  }
}
