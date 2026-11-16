import 'reflect-metadata';
import { createHash } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configurarAplicacion } from '../src/aplicacion.js';
import { PrismaClient } from '../src/generado/prisma/client.js';
import { type IdentidadGoogle, VerificadorGoogle } from '../src/modulos/auth/google.js';
import { Mensajeria } from '../src/modulos/mensajeria/mensajeria.js';
import { urlPropietarioActual } from '../src/nucleo/base-datos/conexiones.js';

export const CLAVE = 'Prueba2026!';
export const CLAVE_SEMILLA = process.env.SEMILLA_CLAVE ?? 'Prueba2026!';

// Credencial falsa de Google: "google|sujeto|correo|nombre"
class GoogleDePrueba extends VerificadorGoogle {
  verificar(credencial: string): Promise<IdentidadGoogle> {
    const [, sujeto, correo, nombre] = credencial.split('|');
    return Promise.resolve({ sujeto: sujeto ?? 'x', correo, correoVerificado: Boolean(correo), nombre });
  }
}

// El límite de solicitudes se prueba aparte; aquí estorbaría a los flujos completos
const sinLimite = {
  increment: () => Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

export type Prueba = {
  app: INestApplication<App>;
  http: () => ReturnType<typeof request>;
  mensajes: Mensajeria;
  bd: PrismaClient;
  cerrar: () => Promise<void>;
};

export async function crearPrueba(opciones: { controladores?: Type[]; conLimite?: boolean } = {}): Promise<Prueba> {
  @Module({ imports: [AppModule], controllers: opciones.controladores ?? [] })
  class ModuloDePrueba {}

  let constructor = Test.createTestingModule({ imports: [ModuloDePrueba] })
    .overrideProvider(VerificadorGoogle)
    .useClass(GoogleDePrueba);
  if (!opciones.conLimite) constructor = constructor.overrideProvider(ThrottlerStorage).useValue(sinLimite);
  const modulo = await constructor.compile();

  const app = modulo.createNestApplication<INestApplication<App>>();
  configurarAplicacion(app);
  await app.init();
  const bd = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlPropietarioActual() }) });
  return {
    app,
    http: () => request(app.getHttpServer()),
    mensajes: app.get(Mensajeria),
    bd,
    cerrar: async () => {
      await bd.$disconnect();
      await app.close();
    },
  };
}

// Los códigos se guardan cifrados: en pruebas se reemplaza el vigente por uno conocido
export async function codigoAdminConocido(prueba: Prueba, telefono: string): Promise<string> {
  const codigo = '246810';
  await prueba.bd.codigoVerificacion.updateMany({
    where: { destino: telefono, proposito: 'INICIO_ADMIN', usadoEn: null },
    data: { hashCodigo: createHash('sha256').update(`${telefono}:INICIO_ADMIN:${codigo}`).digest('hex') },
  });
  return codigo;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Inicia sesión con el teléfono de una cuenta de la semilla; el administrador pasa además por su código
export async function entrar(prueba: Prueba, telefono: string, contrasena = CLAVE_SEMILLA): Promise<string> {
  // Cada suite parte sin códigos previos del administrador: así el inicio siempre emite uno nuevo
  await prueba.bd.codigoVerificacion.deleteMany({ where: { destino: telefono, proposito: 'INICIO_ADMIN' } });
  const respuesta = await prueba
    .http()
    .post('/api/v1/auth/login')
    .send({ identificador: telefono, contrasena })
    .expect(200);
  const cuerpo = respuesta.body as { tokenAcceso?: string; tokenTemporal?: string; codigoDePrueba?: string };
  if (cuerpo.tokenAcceso) return cuerpo.tokenAcceso;
  const codigo = cuerpo.codigoDePrueba ?? (await codigoAdminConocido(prueba, telefono));
  const admin = await prueba
    .http()
    .post('/api/v1/auth/admin/verificar')
    .send({ tokenTemporal: cuerpo.tokenTemporal, codigo })
    .expect(200);
  return (admin.body as { tokenAcceso: string }).tokenAcceso;
}

// Crea un reciclador con el teléfono verificado y devuelve su sesión
export async function nuevoReciclador(prueba: Prueba, telefono: string, nombre = 'Rosa Mamani'): Promise<string> {
  const registro = await prueba
    .http()
    .post('/api/v1/auth/registro/reciclador')
    .send({ nombre, telefono, contrasena: CLAVE, aceptaTerminos: true })
    .expect(201);
  const verificado = await prueba
    .http()
    .post('/api/v1/auth/telefono/verificar')
    .send({ telefono, codigo: (registro.body as { codigoDePrueba: string }).codigoDePrueba })
    .expect(200);
  return (verificado.body as { tokenAcceso: string }).tokenAcceso;
}

export async function nuevoNegocio(
  prueba: Prueba,
  telefono: string,
  tipo: 'CENTRO' | 'MOVIL' = 'CENTRO',
): Promise<string> {
  const registro = await prueba
    .http()
    .post('/api/v1/auth/registro/negocio')
    .send({ tipo, telefono, contrasena: CLAVE, aceptaTerminos: true })
    .expect(201);
  const verificado = await prueba
    .http()
    .post('/api/v1/auth/telefono/verificar')
    .send({ telefono, codigo: (registro.body as { codigoDePrueba: string }).codigoDePrueba })
    .expect(200);
  return (verificado.body as { tokenAcceso: string }).tokenAcceso;
}

export async function zonaDeJuliaca(prueba: Prueba): Promise<number> {
  const ciudades = await prueba.http().get('/api/v1/ciudades').expect(200);
  const juliaca = (ciudades.body as { datos: { id: number; nombre: string }[] }).datos.find(
    (ciudad) => ciudad.nombre === 'Juliaca',
  )!;
  const zonas = await prueba.http().get(`/api/v1/ciudades/${juliaca.id}/zonas`).expect(200);
  return (zonas.body as { datos: { id: number }[] }).datos[0]!.id;
}

export function registroCentro(zonaId: number, nombreComercial = 'EcoAcopio Prueba') {
  return {
    tipo: 'CENTRO',
    nombreComercial,
    whatsapp: '987654321',
    horario: { dias: [1, 2, 3, 4, 5, 6], abre: '08:00', cierra: '18:00' },
    precios: { pet: { min: 0.8, max: 1.2, demanda: 'ALTA' }, carton: { min: 0.3, max: 0.5 } },
    pagos: ['EFECTIVO', 'YAPE'],
    direccion: 'Jr. Moquegua 123, Juliaca',
    zonaId,
    ubicacion: { lat: -15.4935, lng: -70.1355 },
  };
}
