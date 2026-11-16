import 'reflect-metadata';
import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configurarAplicacion } from '../src/aplicacion.js';
import { Publica } from '../src/nucleo/seguridad/decoradores.js';
import { Configuracion } from '../src/nucleo/configuracion/configuracion.js';

// Ruta que solo existe en esta prueba: las rutas reales con límite llegan en la Fase 4
@Publica()
@Controller('prueba-limite')
class RutaDePrueba {
  @Get()
  responder(): { ok: true } {
    return { ok: true };
  }
}

@Module({ imports: [AppModule], controllers: [RutaDePrueba] })
class ModuloDePrueba {}

async function crearApp(variables: NodeJS.ProcessEnv = {}): Promise<INestApplication<App>> {
  const modulo = await Test.createTestingModule({ imports: [ModuloDePrueba] })
    .overrideProvider(Configuracion)
    .useValue(new Configuracion({ ...process.env, ...variables }))
    .compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  configurarAplicacion(app);
  await app.init();
  return app;
}

describe('API base', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/salud responde que el proceso vive', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/salud').expect(200);
    expect(respuesta.body).toEqual({ estado: 'ok' });
  });

  it('GET /api/v1/salud/listo comprueba la base de datos', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/salud/listo').expect(200);
    expect(respuesta.body).toEqual({ estado: 'ok', baseDatos: 'ok' });
  });

  it('cada respuesta lleva un identificador de solicitud', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/salud');
    expect(respuesta.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
    const propia = await request(app.getHttpServer()).get('/api/v1/salud').set('X-Request-Id', 'prueba-12345678');
    expect(propia.headers['x-request-id']).toBe('prueba-12345678');
  });

  it('envía cabeceras de seguridad y no revela la tecnología', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/salud');
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['x-frame-options']).toBeDefined();
    expect(respuesta.headers['x-powered-by']).toBeUndefined();
  });

  it('una ruta inexistente responde con el formato de error del proyecto', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/v1/no-existe').expect(404);
    expect(respuesta.body).toEqual({
      error: {
        codigo: 'NO_ENCONTRADO',
        mensaje: 'No encontramos lo que buscas.',
        idSolicitud: respuesta.headers['x-request-id'],
      },
    });
  });

  it('solo acepta el origen de la web', async () => {
    const permitido = await request(app.getHttpServer()).get('/api/v1/salud').set('Origin', 'http://localhost:3000');
    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const ajeno = await request(app.getHttpServer()).get('/api/v1/salud').set('Origin', 'http://otro-sitio.test');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('publica la documentación de la API', async () => {
    const respuesta = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(respuesta.body.info.title).toBe('RecicloMap API');
    expect(Object.keys(respuesta.body.paths)).toEqual(expect.arrayContaining(['/api/v1/salud', '/api/v1/salud/listo']));
  });
});

describe('Límite de solicitudes', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await crearApp({ API_LIMITE_POR_MINUTO: '3' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde 429 con el formato de error al superar el límite', async () => {
    const servidor = app.getHttpServer();
    for (let intento = 0; intento < 3; intento++) {
      await request(servidor).get('/api/v1/prueba-limite').expect(200);
    }
    const respuesta = await request(servidor).get('/api/v1/prueba-limite').expect(429);
    expect(respuesta.body.error.codigo).toBe('DEMASIADAS_SOLICITUDES');
  });

  it('la ruta de salud no cuenta para el límite', async () => {
    const servidor = app.getHttpServer();
    for (let intento = 0; intento < 6; intento++) {
      await request(servidor).get('/api/v1/salud').expect(200);
    }
  });
});
