import type { INestApplication } from '@nestjs/common';
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
  app.setGlobalPrefix(PREFIJO_API);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configuracion.origenesWeb,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.enableShutdownHooks();

  if (!configuracion.esProduccion) {
    const documento = new DocumentBuilder()
      .setTitle('RecicloMap API')
      .setDescription('API REST de RecicloMap. Todas las rutas van bajo /api/v1.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(RUTA_DOCUMENTACION, app, SwaggerModule.createDocument(app, documento));
  }
}
