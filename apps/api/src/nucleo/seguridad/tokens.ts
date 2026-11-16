import { Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { Configuracion } from '../configuracion/configuracion.js';
import { ErrorNegocio } from '../errores/error-negocio.js';

const EMISOR = 'reciclomap';
const AUDIENCIA_ACCESO = 'reciclomap-api';
const AUDIENCIA_TEMPORAL = 'reciclomap-temporal';

export type PropositoTemporal = 'CODIGO_ADMIN' | 'COMPLETAR_GOOGLE' | 'RESTABLECER';

export type CargaAcceso = { usuarioId: string; sesionId: string };

@Injectable()
export class Tokens {
  constructor(private readonly configuracion: Configuracion) {}

  async firmarAcceso(usuarioId: string, sesionId: string): Promise<{ token: string; expiraEn: Date }> {
    const expiraEn = new Date(Date.now() + this.configuracion.accesoMinutos * 60_000);
    const token = await new SignJWT({ sid: sesionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuarioId)
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA_ACCESO)
      .setIssuedAt()
      .setExpirationTime(expiraEn)
      .sign(this.configuracion.jwtSecreto);
    return { token, expiraEn };
  }

  async verificarAcceso(token: string): Promise<CargaAcceso> {
    try {
      const { payload } = await jwtVerify(token, this.configuracion.jwtSecreto, {
        issuer: EMISOR,
        audience: AUDIENCIA_ACCESO,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('Token incompleto');
      return { usuarioId: payload.sub, sesionId: payload.sid };
    } catch (error) {
      const vencido = error instanceof errors.JWTExpired;
      throw new ErrorNegocio(
        vencido ? 'SESION_VENCIDA' : 'NO_AUTENTICADO',
        vencido ? 'Tu sesión venció. Vuelve a entrar.' : 'Inicia sesión para continuar.',
        401,
      );
    }
  }

  // Token de un solo propósito y corta duración para los pasos intermedios del acceso
  firmarTemporal(proposito: PropositoTemporal, datos: Record<string, string>, minutos: number): Promise<string> {
    return new SignJWT({ ...datos, pro: proposito })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA_TEMPORAL)
      .setIssuedAt()
      .setExpirationTime(`${minutos}m`)
      .sign(this.configuracion.jwtSecreto);
  }

  async verificarTemporal(token: string, proposito: PropositoTemporal): Promise<Record<string, string>> {
    try {
      const { payload } = await jwtVerify(token, this.configuracion.jwtSecreto, {
        issuer: EMISOR,
        audience: AUDIENCIA_TEMPORAL,
        algorithms: ['HS256'],
      });
      if (payload.pro !== proposito) throw new Error('Propósito distinto');
      return Object.fromEntries(
        Object.entries(payload).filter((par): par is [string, string] => typeof par[1] === 'string'),
      );
    } catch {
      throw new ErrorNegocio('PASO_VENCIDO', 'Este paso venció. Vuelve a empezar.', 401);
    }
  }
}
