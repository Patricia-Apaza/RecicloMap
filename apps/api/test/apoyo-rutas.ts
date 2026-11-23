import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';

export type RutaApi = { metodo: string; ruta: string; controlador: string };

// Todas las rutas que declaran los controladores, con su método y su ruta completa bajo /api/v1
export function listarRutas(app: INestApplication): RutaApi[] {
  const rutas: RutaApi[] = [];
  for (const modulo of app.get(ModulesContainer).values()) {
    for (const { metatype } of modulo.controllers.values()) {
      if (!metatype) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
      for (const nombre of Object.getOwnPropertyNames(metatype.prototype)) {
        const fn = (metatype.prototype as Record<string, unknown>)[nombre];
        if (typeof fn !== 'function') continue;
        const metodo = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
        if (metodo === undefined) continue;
        const sub = String(Reflect.getMetadata(PATH_METADATA, fn) ?? '');
        const ruta = ['/api/v1', base, sub].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/\/$/, '');
        rutas.push({ metodo: RequestMethod[metodo]!, ruta, controlador: metatype.name });
      }
    }
  }
  return rutas.sort((a, b) => (a.ruta + a.metodo).localeCompare(b.ruta + b.metodo));
}
