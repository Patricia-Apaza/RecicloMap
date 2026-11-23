import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

const ENLACE_REPORTAR = '/operaciones/reportar';

// Lo que pasa con lo que una cuenta suspendida tenía abierto. Todo es idempotente y lo ejecuta el sistema, no la administración
@Injectable()
export class EfectosSuspensionService {
  private readonly registro = new Logger('Suspensión');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Retira las ofertas pendientes y avisa a la otra parte; sin ofertas pendientes, la publicación vuelve a DISPONIBLE
  private async retirarOfertas(
    donde: { compradorId: string } | { publicacion: { recicladorId: string } },
    aviso: (oferta: {
      reciclador: string;
      negocio: string;
      usuarioNegocio: string;
      usuarioReciclador: string;
    }) => Array<{
      usuarioId: string;
      titulo: string;
      mensaje: string;
    }>,
  ): Promise<number> {
    const pendientes = await this.prisma.oferta.findMany({
      where: { estado: 'PENDIENTE', ...donde },
      select: {
        id: true,
        publicacionId: true,
        comprador: { select: { nombreComercial: true, usuarioId: true } },
        publicacion: { select: { reciclador: { select: { id: true, nombre: true } } } },
      },
    });
    let retiradas = 0;
    for (const oferta of pendientes) {
      const hecho = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM publicacion WHERE id = ${oferta.publicacionId}::uuid FOR UPDATE`;
        const cambio = await tx.oferta.updateMany({
          where: { id: oferta.id, estado: 'PENDIENTE' },
          data: { estado: 'RETIRADA', resueltaEn: new Date() },
        });
        if (cambio.count === 0) return false;
        const quedan = await tx.oferta.count({ where: { publicacionId: oferta.publicacionId, estado: 'PENDIENTE' } });
        if (quedan === 0) {
          await tx.publicacion.updateMany({
            where: { id: oferta.publicacionId, estado: 'CON_OFERTAS' },
            data: { estado: 'DISPONIBLE' },
          });
        }
        for (const nota of aviso({
          reciclador: oferta.publicacion.reciclador.nombre,
          negocio: oferta.comprador.nombreComercial,
          usuarioNegocio: oferta.comprador.usuarioId,
          usuarioReciclador: oferta.publicacion.reciclador.id,
        })) {
          await this.notificaciones.crear(tx, {
            usuarioId: nota.usuarioId,
            tipo: 'OFERTA',
            titulo: nota.titulo,
            mensaje: nota.mensaje,
            enlace: '/ofertas',
            obligatoria: true,
          });
        }
        return true;
      });
      if (hecho) retiradas += 1;
    }
    return retiradas;
  }

  async retirarPendientes(usuarioId: string): Promise<number> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { comprador: { select: { id: true } } },
    });
    let total = 0;
    if (usuario?.comprador) {
      total += await this.retirarOfertas({ compradorId: usuario.comprador.id }, (o) => [
        {
          usuarioId: o.usuarioReciclador,
          titulo: 'Una oferta fue retirada',
          mensaje: `${o.negocio} ya no puede atender ofertas por ahora. Tu publicación sigue disponible para otros negocios.`,
        },
      ]);
    }
    total += await this.retirarOfertas({ publicacion: { recicladorId: usuarioId } }, (o) => [
      {
        usuarioId: o.usuarioNegocio,
        titulo: 'Una publicación ya no está disponible',
        mensaje: `La publicación a la que ofertaste ya no está disponible por ahora; tu oferta se retiró.`,
      },
    ]);
    return total;
  }

  // Las operaciones en curso no se cortan solas: se avisa a la otra parte, que puede reportar un problema
  async avisarOperacionesEnCurso(usuarioId: string): Promise<number> {
    const operaciones = await this.prisma.operacion.findMany({
      where: {
        estado: { in: ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'] },
        OR: [{ recicladorId: usuarioId }, { comprador: { usuarioId } }],
      },
      select: {
        recicladorId: true,
        reciclador: { select: { nombre: true } },
        comprador: { select: { usuarioId: true, nombreComercial: true } },
      },
    });
    for (const o of operaciones) {
      const esReciclador = o.recicladorId === usuarioId;
      await this.notificaciones.crear(this.prisma, {
        usuarioId: esReciclador ? o.comprador.usuarioId : o.recicladorId,
        tipo: 'OPERACION',
        titulo: 'La otra cuenta de tu operación fue suspendida',
        mensaje: `${esReciclador ? o.reciclador.nombre : o.comprador.nombreComercial} no puede hacer cambios por ahora. Tu operación sigue abierta; si hay un problema, repórtalo.`,
        enlace: ENLACE_REPORTAR,
        obligatoria: true,
      });
    }
    return operaciones.length;
  }

  async aplicar(usuarioId: string): Promise<{ ofertasRetiradas: number; operacionesAvisadas: number }> {
    const ofertasRetiradas = await this.retirarPendientes(usuarioId);
    const operacionesAvisadas = await this.avisarOperacionesEnCurso(usuarioId);
    return { ofertasRetiradas, operacionesAvisadas };
  }

  // Red de seguridad: si algo quedó pendiente de una cuenta suspendida, se retira
  @Cron('*/30 * * * *', { name: 'efectos-de-suspension' })
  async barrer(): Promise<void> {
    if (enMantenimiento()) return;
    try {
      const suspendidos = await this.prisma.usuario.findMany({ where: { estado: 'SUSPENDIDO' }, select: { id: true } });
      for (const { id } of suspendidos) await this.retirarPendientes(id);
    } catch (error) {
      this.registro.error(`No se pudieron aplicar los efectos de una suspensión: ${String(error)}`);
    }
  }
}
