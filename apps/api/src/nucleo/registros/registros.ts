import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Configuracion } from '../configuracion/configuracion.js';

const ID_VALIDO = /^[\w-]{8,64}$/;

// Datos que nunca deben quedar en los registros
export const CAMPOS_OCULTOS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-posicion"]',
  'req.headers["x-zona"]',
  'res.headers["set-cookie"]',
];

export function idDeSolicitud(solicitud: IncomingMessage, respuesta: ServerResponse): string {
  const recibido = solicitud.headers['x-request-id'];
  const id = typeof recibido === 'string' && ID_VALIDO.test(recibido) ? recibido : randomUUID();
  respuesta.setHeader('X-Request-Id', id);
  return id;
}

export function opcionesDeRegistro(configuracion: Configuracion): Params {
  return {
    pinoHttp: {
      level: configuracion.nivelLog,
      genReqId: idDeSolicitud,
      redact: { paths: CAMPOS_OCULTOS, censor: '[oculto]' },
      autoLogging: { ignore: (solicitud) => solicitud.url?.startsWith('/api/v1/salud') ?? false },
      transport:
        configuracion.entorno === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
  };
}
