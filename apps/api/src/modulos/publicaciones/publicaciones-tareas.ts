import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { PublicacionesRepositorio } from './publicaciones.repositorio.js';
import { PublicacionesService } from './publicaciones.service.js';
import { avisos } from './textos.js';

const ANTICIPO_AVISO_MS = 2 * 86_400_000;

// Cada tarea revalida el estado antes de actuar y puede repetirse sin duplicar efectos
@Injectable()
export class PublicacionesTareas {
  private readonly registro = new Logger('Publicaciones');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly repositorio: PublicacionesRepositorio,
    private readonly publicaciones: PublicacionesService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('5 * * * *', { name: 'publicaciones-vencidas', timeZone: 'America/Lima' })
  async barridoVencidas(): Promise<void> {
    const vencidas = await this.vencer();
    if (vencidas > 0) this.registro.log(`${vencidas} publicaciones vencidas.`);
  }

  @Cron('0 9 * * *', { name: 'publicaciones-por-vencer', timeZone: 'America/Lima' })
  async barridoPorVencer(): Promise<void> {
    const avisadas = await this.avisarPorVencer();
    if (avisadas > 0) this.registro.log(`Aviso de vencimiento enviado en ${avisadas} publicaciones.`);
  }

  // A los 7 días: VENCIDA y sus ofertas pendientes a NO_SELECCIONADA con aviso al negocio
  async vencer(ahora: Date = new Date()): Promise<number> {
    const candidatas = await this.prisma.publicacion.findMany({
      where: { estado: { in: ['DISPONIBLE', 'CON_OFERTAS'] }, venceEn: { lte: ahora } },
      select: { id: true },
    });
    let vencidas = 0;
    for (const { id } of candidatas) {
      const hecho = await this.prisma.$transaction(async (tx) => {
        const fila = await this.repositorio.bloquear(tx, id);
        if (!fila || !['DISPONIBLE', 'CON_OFERTAS'].includes(fila.estado) || fila.venceEn > ahora) return false;
        await this.publicaciones.cerrarPendientes(tx, id, 'publicacionNoDisponible');
        await tx.publicacion.update({ where: { id }, data: { estado: 'VENCIDA' } });
        return true;
      });
      if (hecho) vencidas++;
    }
    return vencidas;
  }

  // Dos días antes del vencimiento, una sola vez por vigencia (al renovar se vuelve a avisar)
  async avisarPorVencer(ahora: Date = new Date()): Promise<number> {
    const candidatas = await this.prisma.publicacion.findMany({
      where: {
        estado: { in: ['DISPONIBLE', 'CON_OFERTAS'] },
        avisoVencerEn: null,
        venceEn: { gt: ahora, lte: new Date(ahora.getTime() + ANTICIPO_AVISO_MS) },
      },
      select: { id: true, recicladorId: true, cantidadKg: true, material: { select: { nombre: true } } },
    });
    for (const publicacion of candidatas) {
      await this.prisma.$transaction(async (tx) => {
        const marcada = await tx.publicacion.updateMany({
          where: { id: publicacion.id, avisoVencerEn: null },
          data: { avisoVencerEn: ahora },
        });
        if (marcada.count === 0) return;
        await this.notificaciones.crear(
          tx,
          avisos.porVencer({
            usuarioId: publicacion.recicladorId,
            material: publicacion.material.nombre,
            kg: publicacion.cantidadKg.toString(),
            publicacionId: publicacion.id,
          }),
        );
      });
    }
    return candidatas.length;
  }
}
