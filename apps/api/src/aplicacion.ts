import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { Configuracion } from './nucleo/configuracion/configuracion.js';

export const PREFIJO_API = 'api/v1';
export const RUTA_DOCUMENTACION = 'api/docs';

// Configuración común a la aplicación real y a las pruebas de extremo a extremo
export function configurarAplicacion(app: INestApplication): void {
  const configuracion = app.get(Configuracion);

  app.useLogger(app.get(Logger));
  // Detrás de la web y de un túnel, la IP de la persona viene en X-Forwarded-For: sin esto todas compartirían los mismos límites
  if (configuracion.confiarProxy > 0) {
    (app.getHttpAdapter().getInstance() as { set: (clave: string, valor: number) => void }).set(
      'trust proxy',
      configuracion.confiarProxy,
    );
  }
  app.setGlobalPrefix(PREFIJO_API);
  app.use(
    helmet({
      // La API solo entrega JSON e imágenes: nada se incrusta ni se ejecuta desde aquí
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: configuracion.esProduccion ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  // Defensa contra CSRF: una escritura que llega con un origen que no es el de la web se rechaza antes de tocar la sesión
  app.use((solicitud: Request, respuesta: Response, siguiente: NextFunction) => {
    const origen = solicitud.headers.origin;
    const lectura = ['GET', 'HEAD', 'OPTIONS'].includes(solicitud.method);
    if (!lectura && origen && !configuracion.origenesWeb.includes(origen)) {
      const id = randomUUID();
      respuesta.setHeader('X-Request-Id', id);
      respuesta.status(403).json({
        error: {
          codigo: 'ORIGEN_NO_PERMITIDO',
          mensaje: 'Esta solicitud no viene de RecicloMap.',
          idSolicitud: id,
        },
      });
      return;
    }
    siguiente();
  });
  app.use(cookieParser());
  app.enableCors({
    origin: configuracion.origenesWeb,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.enableShutdownHooks();

  // La documentación solo existe en desarrollo (o si se pide a propósito en pruebas); en producción la ruta no responde
  if (configuracion.exponeDocumentacion) {
    const documento = new DocumentBuilder()
      .setTitle('RecicloMap API')
      .setDescription('API REST de RecicloMap. Todas las rutas van bajo /api/v1.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(RUTA_DOCUMENTACION, app, SwaggerModule.createDocument(app, documento));
  }
}
