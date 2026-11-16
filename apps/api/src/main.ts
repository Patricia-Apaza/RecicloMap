import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configurarAplicacion, PREFIJO_API, RUTA_DOCUMENTACION } from './aplicacion.js';
import { Configuracion } from './nucleo/configuracion/configuracion.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configurarAplicacion(app);

const { puerto } = app.get(Configuracion);
await app.listen(puerto);
app
  .get(Logger)
  .log(
    `API en http://localhost:${puerto}/${PREFIJO_API} · documentación en http://localhost:${puerto}/${RUTA_DOCUMENTACION}`,
  );
