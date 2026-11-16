import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { OperacionesService } from './operaciones.service.js';
import { avisosOperacion } from './textos.js';

const HORA_MS = 3_600_000;

// Plazos de 72 h; cada tarea revalida el estado y se puede repetir sin duplicar efectos
@Injectable()
export class OperacionesTareas {
  private readonly registro = new Logger('Operaciones');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly operaciones: OperacionesService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('*/10 * * * *', { name: 'operaciones-plazos', timeZone: 'America/Lima' })
  async barrido(): Promise<void> {
    const cerradas = await this.cerrarVencidas();
    const avisadas = await this.avisarSinConfirmar();
    if (cerradas + avisadas > 0)
      this.registro.log(`${cerradas} cerradas por plazo, ${avisadas} avisos de entrega sin confirmar.`);
  }

  // 72 h en CONFIRMADA sin respuesta ni disputa: se completa sola
  async cerrarVencidas(ahora: Date = new Date()): Promise<number> {
    const horas = await this.operaciones.plazoHoras('plazo_conformidad_horas');
    const candidatas = await this.prisma.operacion.findMany({
      where: {
        estado: 'CONFIRMADA',
        enDisputa: false,
        confirmadaEn: { lte: new Date(ahora.getTime() - horas * HORA_MS) },
      },
      select: { id: true },
    });
    let cerradas = 0;
    for (const { id } of candidatas) if (await this.operaciones.cerrarPorPlazo(id)) cerradas++;
    return cerradas;
  }

  // 72 h en ENTREGADA sin confirmar: se avisa a ambos una vez; no hay cierre automático
  async avisarSinConfirmar(ahora: Date = new Date()): Promise<number> {
    const horas = await this.operaciones.plazoHoras('plazo_aviso_entrega_horas');
    const candidatas = await this.prisma.operacion.findMany({
      where: {
        estado: 'ENTREGADA',
        avisoEntregaEn: null,
        entregadaEn: { lte: new Date(ahora.getTime() - horas * HORA_MS) },
      },
      select: {
        id: true,
        recicladorId: true,
        comprador: { select: { usuarioId: true } },
        publicacion: { select: { cantidadKg: true, material: { select: { nombre: true } } } },
      },
    });
    let avisadas = 0;
    for (const operacion of candidatas) {
      await this.prisma.$transaction(async (tx) => {
        const marcada = await tx.operacion.updateMany({
          where: { id: operacion.id, estado: 'ENTREGADA', avisoEntregaEn: null },
          data: { avisoEntregaEn: ahora },
        });
        if (marcada.count === 0) return;
        const base = {
          operacionId: operacion.id,
          material: operacion.publicacion.material.nombre,
          kg: operacion.publicacion.cantidadKg.toString(),
        };
        await this.notificaciones.crear(
          tx,
          avisosOperacion.sinConfirmar({ ...base, usuarioId: operacion.recicladorId }),
        );
        await this.notificaciones.crear(
          tx,
          avisosOperacion.sinConfirmar({ ...base, usuarioId: operacion.comprador.usuarioId }),
        );
        avisadas++;
      });
    }
    return avisadas;
  }
}
