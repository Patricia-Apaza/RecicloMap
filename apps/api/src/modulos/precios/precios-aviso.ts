import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { MapaRepositorio } from '../mapa/mapa.repositorio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

const TITULO = 'Actualiza tus precios';
const DIA_MS = 86_400_000;

// Barrido diario: avisa una vez por período a los negocios con algún precio sin actualizar
@Injectable()
export class PreciosAviso {
  private readonly registro = new Logger('PreciosAviso');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly mapa: MapaRepositorio,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('0 8 * * *', { name: 'precios-desactualizados', timeZone: 'America/Lima' })
  async ejecutar(): Promise<void> {
    const avisados = await this.avisarDesactualizados();
    if (avisados > 0) this.registro.log(`Aviso de precio desactualizado enviado a ${avisados} negocios.`);
  }

  // Se puede repetir sin duplicar: si ya avisó en el período, no vuelve a avisar
  async avisarDesactualizados(ahora: Date = new Date()): Promise<number> {
    const dias = await this.mapa.diasPrecioAlDia();
    const limite = new Date(ahora.getTime() - dias * DIA_MS);
    const negocios = await this.prisma.comprador.findMany({
      where: {
        estadoVerificacion: 'APROBADO',
        usuario: { estado: 'ACTIVO' },
        precios: { some: { activo: true, actualizadoEn: { lt: limite } } },
      },
      select: {
        usuarioId: true,
        precios: {
          where: { activo: true, actualizadoEn: { lt: limite } },
          select: { material: { select: { nombre: true } } },
        },
      },
    });
    let avisados = 0;
    for (const negocio of negocios) {
      const reciente = await this.prisma.notificacion.count({
        where: { usuarioId: negocio.usuarioId, tipo: 'PRECIO', titulo: TITULO, creadaEn: { gte: limite } },
      });
      if (reciente > 0) continue;
      const materiales = negocio.precios.map((precio) => precio.material.nombre).join(', ');
      await this.notificaciones.crear(this.prisma, {
        usuarioId: negocio.usuarioId,
        tipo: 'PRECIO',
        titulo: TITULO,
        mensaje: `Tu precio de ${materiales} tiene más de ${dias} días. Los recicladores lo ven como antiguo.`.slice(
          0,
          200,
        ),
        enlace: '/negocio/precios',
        obligatoria: true,
      });
      avisados++;
    }
    return avisados;
  }
}
