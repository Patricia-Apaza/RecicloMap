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
    const sesion = await this.prisma.sesion.create({
      data: {
        usuarioId,
        familia,
        hashToken: hashear(tokenRefresco),
        expiraEn: new Date(Date.now() + this.configuracion.refrescoDias * 86_400_000),
        agente: agente?.slice(0, 200),
      },
      select: { id: true },
    });
    return { sesionId: sesion.id, tokenRefresco };
  }

  // Cada uso entrega un token nuevo; reutilizar uno ya gastado indica robo y cierra todas las sesiones
  async rotar(tokenRefresco: string, agente?: string) {
    const sesion = await this.prisma.sesion.findUnique({ where: { hashToken: hashear(tokenRefresco) } });
    if (!sesion) throw SESION_INVALIDA();
    if (sesion.usadaEn || sesion.revocadaEn) {
      if (sesion.usadaEn) await this.revocarTodas(sesion.usuarioId);
      throw SESION_INVALIDA();
    }
    if (sesion.expiraEn <= new Date()) throw SESION_INVALIDA();

    const marcada = await this.prisma.sesion.updateMany({
      where: { id: sesion.id, usadaEn: null, revocadaEn: null },
      data: { usadaEn: new Date(), revocadaEn: new Date() },
    });
    if (marcada.count === 0) throw SESION_INVALIDA();
    const nueva = await this.crear(sesion.usuarioId, agente, sesion.familia);
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
