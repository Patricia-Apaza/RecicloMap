import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaApi } from '../base-datos/prisma.js';
import { Configuracion } from '../configuracion/configuracion.js';
import { ErrorNegocio } from '../errores/error-negocio.js';

const hashear = (token: string) => createHash('sha256').update(token).digest('hex');

const SESION_INVALIDA = () => new ErrorNegocio('SESION_INVALIDA', 'Tu sesión terminó. Vuelve a entrar.', 401);

@Injectable()
export class Sesiones {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly configuracion: Configuracion,
  ) {}

  async crear(usuarioId: string, agente?: string, familia: string = randomUUID()) {
    const tokenRefresco = randomBytes(32).toString('base64url');
    const expiraEn = await this.expiracion(usuarioId, familia);
    const sesion = await this.prisma.sesion.create({
      data: { usuarioId, familia, hashToken: hashear(tokenRefresco), expiraEn, agente: agente?.slice(0, 200) },
      select: { id: true },
    });
    return { sesionId: sesion.id, tokenRefresco, expiraEn };
  }

  // La administración no se renueva sin fin: toda su sesión termina a las SESION_ADMIN_HORAS de haber iniciado
  private async expiracion(usuarioId: string, familia: string): Promise<Date> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { rol: true } });
    const normal = new Date(Date.now() + this.configuracion.refrescoDias * 86_400_000);
    if (usuario?.rol !== 'ADMIN') return normal;
    const inicio = await this.prisma.sesion.findFirst({
      where: { familia },
      orderBy: { creadaEn: 'asc' },
      select: { creadaEn: true },
    });
    const limite = new Date(
      (inicio?.creadaEn ?? new Date()).getTime() + this.configuracion.sesionAdminHoras * 3_600_000,
    );
    return limite < normal ? limite : normal;
  }

  // Cada uso entrega un token nuevo. Reutilizar uno ya gastado indica robo y cierra todas las sesiones, salvo dentro de una
  // gracia corta: dos renovaciones que se cruzan (recargar o abrir otra pestaña mientras la primera sigue en camino) no son un robo
  async rotar(tokenRefresco: string, agente?: string) {
    const sesion = await this.prisma.sesion.findUnique({ where: { hashToken: hashear(tokenRefresco) } });
    if (!sesion) throw SESION_INVALIDA();
    const gracia = this.configuracion.sesionGraciaSegundos * 1000;
    const cruzada = sesion.usadaEn !== null && Date.now() - sesion.usadaEn.getTime() <= gracia;
    if (!cruzada && (sesion.usadaEn || sesion.revocadaEn)) {
      if (sesion.usadaEn) await this.revocarTodas(sesion.usuarioId);
      throw SESION_INVALIDA();
    }
    if (sesion.expiraEn <= new Date()) throw SESION_INVALIDA();

    if (!cruzada) {
      const marcada = await this.prisma.sesion.updateMany({
        where: { id: sesion.id, usadaEn: null, revocadaEn: null },
        data: { usadaEn: new Date(), revocadaEn: new Date() },
      });
      if (marcada.count === 0) {
        // Otra renovación ganó justo ahora: se atiende igual, dentro de la gracia
        const actual = await this.prisma.sesion.findUnique({ where: { id: sesion.id } });
        if (!actual?.usadaEn || Date.now() - actual.usadaEn.getTime() > gracia) throw SESION_INVALIDA();
      }
    }
    const nueva = await this.crear(sesion.usuarioId, agente, sesion.familia);
    if (nueva.expiraEn <= new Date()) throw SESION_INVALIDA();
    return { usuarioId: sesion.usuarioId, ...nueva };
  }

  async revocarPorToken(tokenRefresco: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { hashToken: hashear(tokenRefresco), revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  async revocar(sesionId: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { id: sesionId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  async revocarTodas(usuarioId: string): Promise<void> {
    await this.prisma.sesion.updateMany({ where: { usuarioId, revocadaEn: null }, data: { revocadaEn: new Date() } });
  }
}
