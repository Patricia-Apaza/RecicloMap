import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configurarAplicacion, PREFIJO_API, RUTA_DOCUMENTACION } from './aplicacion.js';
import { PrismaApi } from './nucleo/base-datos/prisma.js';
import { verificarArranqueSeguro } from './nucleo/configuracion/arranque.js';
import { Configuracion } from './nucleo/configuracion/configuracion.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configurarAplicacion(app);

const configuracion = app.get(Configuracion);
const { puerto } = configuracion;
if (configuracion.esProduccion) {
  await verificarArranqueSeguro(app.get(PrismaApi), undefined, { demostracion: configuracion.demostracion });
}
if (configuracion.demostracion) {
  app
    .get(Logger)
    .warn(
      'MODO DEMOSTRACIÓN ACTIVO: datos de prueba, SMS y correo simulados. No es producción ni se debe usar con personas reales.',
    );
}
await app.listen(puerto);
app
  .get(Logger)
  .log(
    `API en http://localhost:${puerto}/${PREFIJO_API} · documentación en http://localhost:${puerto}/${RUTA_DOCUMENTACION}`,
  );
