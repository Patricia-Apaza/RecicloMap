import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PropositoCodigo } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { SMS_CODIGO } from '../mensajeria/textos-sms.js';
import { Mensajeria } from '../mensajeria/mensajeria.js';

export const VIGENCIA_CODIGO_MINUTOS = 10;
export const INTENTOS_POR_CODIGO = 5;
export const ESPERA_REENVIO_SEGUNDOS = 60;
// Configurable solo para que las pruebas de navegador, que inician sesión de administración varias veces, no lo agoten
const CODIGOS_POR_HORA = Math.max(1, Number(process.env.AUTH_CODIGOS_POR_HORA) || 5);

export type CodigoEnviado = { reenviarEn: number; codigoDePrueba?: string };

const hashear = (destino: string, proposito: PropositoCodigo, codigo: string) =>
  createHash('sha256').update(`${destino}:${proposito}:${codigo}`).digest('hex');

@Injectable()
export class Codigos {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly mensajeria: Mensajeria,
    private readonly configuracion: Configuracion,
  ) {}

  async enviar(opciones: {
    destino: string;
    proposito: PropositoCodigo;
    canal: 'sms' | 'correo';
    usuarioId?: string;
  }): Promise<CodigoEnviado> {
    const { destino, proposito, canal, usuarioId } = opciones;
    const ahora = Date.now();
    const recientes = await this.prisma.codigoVerificacion.findMany({
      where: { destino, proposito, creadoEn: { gte: new Date(ahora - 3_600_000) } },
      orderBy: { creadoEn: 'desc' },
      select: { creadoEn: true, usadoEn: true },
    });
    const ultimo = recientes[0];
    // Si el último ya se usó, se puede pedir otro sin esperar (por ejemplo, al volver a entrar)
    if (ultimo && !ultimo.usadoEn) {
      const segundos = Math.ceil((ultimo.creadoEn.getTime() + ESPERA_REENVIO_SEGUNDOS * 1000 - ahora) / 1000);
      if (segundos > 0) {
        throw new ErrorNegocio('ESPERA_REENVIO', `Espera ${segundos} segundos para pedir otro código.`, 429);
      }
    }
    if (recientes.length >= CODIGOS_POR_HORA) {
      throw new ErrorNegocio('DEMASIADOS_CODIGOS', 'Pediste demasiados códigos. Intenta de nuevo en una hora.', 429);
    }

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.codigoVerificacion.updateMany({
        where: { destino, proposito, usadoEn: null, expiraEn: { gt: new Date(ahora) } },
        data: { expiraEn: new Date(ahora) },
      }),
      this.prisma.codigoVerificacion.create({
        data: {
          destino,
          proposito,
          usuarioId,
          hashCodigo: hashear(destino, proposito, codigo),
          expiraEn: new Date(ahora + VIGENCIA_CODIGO_MINUTOS * 60_000),
        },
      }),
    ]);

    const texto = SMS_CODIGO[proposito](codigo);
    if (canal === 'sms') await this.mensajeria.enviarSms(destino, texto);
    else await this.mensajeria.enviarCorreo(destino, 'Tu código de RecicloMap', texto);

    return {
      reenviarEn: ESPERA_REENVIO_SEGUNDOS,
      ...(this.configuracion.exponerCodigo ? { codigoDePrueba: codigo } : {}),
    };
  }

  // Devuelve el usuario dueño del código; cada error dice qué hacer
  async verificar(destino: string, proposito: PropositoCodigo, codigo: string): Promise<string | null> {
    const vigente = await this.prisma.codigoVerificacion.findFirst({
      where: { destino, proposito, usadoEn: null, expiraEn: { gt: new Date() } },
      orderBy: { creadoEn: 'desc' },
    });
    if (!vigente) throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);
    if (vigente.intentos >= INTENTOS_POR_CODIGO) {
      throw new ErrorNegocio('CODIGO_BLOQUEADO', 'Superaste los intentos permitidos. Pide un código nuevo.', 422);
    }

    const esperado = Buffer.from(vigente.hashCodigo, 'hex');
    const recibido = Buffer.from(hashear(destino, proposito, codigo), 'hex');
    if (!timingSafeEqual(esperado, recibido)) {
      const actualizado = await this.prisma.codigoVerificacion.update({
        where: { id: vigente.id },
        data: { intentos: { increment: 1 } },
        select: { intentos: true },
      });
      const quedan = INTENTOS_POR_CODIGO - actualizado.intentos;
      throw new ErrorNegocio(
        quedan > 0 ? 'CODIGO_INCORRECTO' : 'CODIGO_BLOQUEADO',
        quedan > 0
          ? `El código no es correcto. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.`
          : 'Superaste los intentos permitidos. Pide un código nuevo.',
        422,
      );
    }

    const usado = await this.prisma.codigoVerificacion.updateMany({
      where: { id: vigente.id, usadoEn: null },
      data: { usadoEn: new Date() },
    });
    if (usado.count === 0) throw new ErrorNegocio('CODIGO_VENCIDO', 'El código ya se usó. Pide uno nuevo.', 422);
    return vigente.usuarioId;
  }
}
