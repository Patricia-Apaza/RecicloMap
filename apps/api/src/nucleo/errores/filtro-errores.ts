import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { CODIGOS_ERROR, type CampoConError, type RespuestaError } from '@reciclomap/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ErrorNegocio } from './error-negocio.js';

type Traduccion = { estado: number; codigo: string; mensaje: string; campos?: CampoConError[] };

const POR_ESTADO: Record<number, { codigo: string; mensaje: string }> = {
  400: { codigo: CODIGOS_ERROR.ENTRADA_NO_VALIDA, mensaje: 'Los datos enviados no son válidos.' },
  401: { codigo: CODIGOS_ERROR.NO_AUTENTICADO, mensaje: 'Inicia sesión para continuar.' },
  403: { codigo: CODIGOS_ERROR.SIN_PERMISO, mensaje: 'No tienes permiso para hacer esto.' },
  404: { codigo: CODIGOS_ERROR.NO_ENCONTRADO, mensaje: 'No encontramos lo que buscas.' },
  409: { codigo: CODIGOS_ERROR.CONFLICTO, mensaje: 'La acción ya no es posible en el estado actual.' },
  413: { codigo: 'ARCHIVO_MUY_GRANDE', mensaje: 'La foto pesa más de 8 MB. Elige una más liviana.' },
  422: { codigo: CODIGOS_ERROR.REGLA_DE_NEGOCIO, mensaje: 'No se puede completar la acción.' },
  429: {
    codigo: CODIGOS_ERROR.DEMASIADAS_SOLICITUDES,
    mensaje: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
  },
  503: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'El servicio no está disponible por ahora.' },
};

const INTERNO: Traduccion = {
  estado: 500,
  codigo: CODIGOS_ERROR.ERROR_INTERNO,
  mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.',
};

export function traducirError(error: unknown): Traduccion {
  if (error instanceof ErrorNegocio) {
    return { estado: error.estado, codigo: error.codigo, mensaje: error.message, campos: error.campos };
  }
  if (error instanceof ZodError) {
    return {
      estado: 400,
      ...POR_ESTADO[400]!,
      campos: error.issues.map((problema) => ({ campo: problema.path.join('.'), mensaje: problema.message })),
    };
  }
  if (error instanceof ThrottlerException) {
    return { estado: 429, ...POR_ESTADO[429]! };
  }
  if (error instanceof HttpException) {
    const estado = error.getStatus();
    const conocido = POR_ESTADO[estado];
    return conocido ? { estado, ...conocido } : { ...INTERNO, estado: estado >= 500 ? estado : INTERNO.estado };
  }
  return INTERNO;
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly registro = new Logger('Errores');

  catch(error: unknown, contexto: ArgumentsHost): void {
    const http = contexto.switchToHttp();
    const solicitud = http.getRequest<Request & { id?: string }>();
    const respuesta = http.getResponse<Response>();
    const { estado, codigo, mensaje, campos } = traducirError(error);

    if (estado >= 500) {
      this.registro.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }

    const cuerpo: RespuestaError = {
      error: { codigo, mensaje, ...(campos?.length ? { campos } : {}), idSolicitud: solicitud.id },
    };
    respuesta.status(estado).json(cuerpo);
  }
}
