import { Injectable } from '@nestjs/common';
import type { GrupoNotificacion } from '@reciclomap/shared';
import type { NotificacionTipo } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

export type NuevaNotificacion = {
  usuarioId: string;
  tipo: NotificacionTipo;
  titulo: string;
  mensaje: string;
  enlace?: string;
  // Avisos de una operación propia o de la cuenta: no se pueden apagar en las preferencias
  obligatoria?: boolean;
};

export const GRUPO_POR_TIPO: Record<NotificacionTipo, GrupoNotificacion> = {
  OFERTA: 'ofertas',
  ACEPTACION: 'ofertas',
  OPERACION: 'operaciones',
  CONFIRMACION: 'operaciones',
  DESAFIO: 'premios',
  GIRO: 'premios',
  INSIGNIA: 'premios',
  NIVEL: 'premios',
  PRECIO: 'avisos',
  AVISO: 'avisos',
};
const TIPOS_DEL_GRUPO = (grupo: GrupoNotificacion) =>
  (Object.keys(GRUPO_POR_TIPO) as NotificacionTipo[]).filter((tipo) => GRUPO_POR_TIPO[tipo] === grupo);

const CAMPO_PREFERENCIA = {
  ofertas: 'notifOfertas',
  premios: 'notifPremios',
  avisos: 'notifAvisos',
} as const;

export type Preferencias = { ofertas: boolean; operaciones: true; premios: boolean; avisos: boolean; precios: boolean };

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaApi) {}

  // Se recibe el cliente para crearla en la misma transacción que el hecho que la origina
  async crear(cliente: ClienteBd, notificacion: NuevaNotificacion): Promise<void> {
    const { obligatoria, ...datos } = notificacion;
    const grupo = GRUPO_POR_TIPO[datos.tipo];
    if (!obligatoria && grupo !== 'operaciones') {
      const preferencia = await cliente.preferenciaUsuario.findUnique({ where: { usuarioId: datos.usuarioId } });
      if (preferencia && !preferencia[CAMPO_PREFERENCIA[grupo]]) return;
    }
    await cliente.notificacion.create({ data: datos });
  }

  listar(usuarioId: string, filtro: 'todas' | 'sin-leer' | GrupoNotificacion) {
    const donde =
      filtro === 'todas' ? {} : filtro === 'sin-leer' ? { leidaEn: null } : { tipo: { in: TIPOS_DEL_GRUPO(filtro) } };
    return this.prisma.notificacion.findMany({
      where: { usuarioId, ...donde },
      orderBy: { creadaEn: 'desc' },
      take: 50,
      select: { id: true, tipo: true, titulo: true, mensaje: true, enlace: true, leidaEn: true, creadaEn: true },
    });
  }

  contarSinLeer(usuarioId: string): Promise<number> {
    return this.prisma.notificacion.count({ where: { usuarioId, leidaEn: null } });
  }

  async marcarLeida(usuarioId: string, id: string): Promise<void> {
    const resultado = await this.prisma.notificacion.updateMany({
      where: { id, usuarioId, leidaEn: null },
      data: { leidaEn: new Date() },
    });
    if (resultado.count === 0) {
      const existe = await this.prisma.notificacion.count({ where: { id, usuarioId } });
      if (!existe) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa notificación.', 404);
    }
  }

  async marcarTodasLeidas(usuarioId: string): Promise<void> {
    await this.prisma.notificacion.updateMany({ where: { usuarioId, leidaEn: null }, data: { leidaEn: new Date() } });
  }

  async preferencias(usuarioId: string): Promise<Preferencias> {
    const fila = await this.prisma.preferenciaUsuario.upsert({
      where: { usuarioId },
      create: { usuarioId },
      update: {},
    });
    return {
      ofertas: fila.notifOfertas,
      operaciones: true,
      premios: fila.notifPremios,
      avisos: fila.notifAvisos,
      precios: fila.notifPrecios,
    };
  }

  async cambiarPreferencias(
    usuarioId: string,
    cambio: Partial<Record<'ofertas' | 'premios' | 'avisos' | 'precios', boolean>>,
  ): Promise<Preferencias> {
    const datos = {
      ...(cambio.ofertas !== undefined ? { notifOfertas: cambio.ofertas } : {}),
      ...(cambio.premios !== undefined ? { notifPremios: cambio.premios } : {}),
      ...(cambio.avisos !== undefined ? { notifAvisos: cambio.avisos } : {}),
      ...(cambio.precios !== undefined ? { notifPrecios: cambio.precios } : {}),
    };
    await this.prisma.preferenciaUsuario.upsert({
      where: { usuarioId },
      create: { usuarioId, ...datos },
      update: datos,
    });
    return this.preferencias(usuarioId);
  }

  async suscribirPush(usuarioId: string, datos: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.prisma.suscripcionPush.upsert({
      where: { endpoint: datos.endpoint },
      create: { usuarioId, endpoint: datos.endpoint, p256dh: datos.keys.p256dh, auth: datos.keys.auth },
      update: { usuarioId, p256dh: datos.keys.p256dh, auth: datos.keys.auth },
    });
  }

  async desuscribirPush(usuarioId: string, endpoint: string): Promise<void> {
    await this.prisma.suscripcionPush.deleteMany({ where: { usuarioId, endpoint } });
  }
}
