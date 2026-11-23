'use client';

import { RUTAS } from '@/navegacion/rutas';
import { cabecerasDeUbicacion, ubicacionActual } from '@/mapa/ubicacion';
import { ErrorApi, pedir } from '@/sesion/api';
import type { Publicacion } from './tipos';

export type ModoCopia = 'volver-a-publicar' | 'duplicar';

// Volver a publicar o duplicar toma la ubicación de nuevo; sin ella se completa en Publicar con los datos
export async function copiarPublicacion(
  publicacion: Pick<Publicacion, 'id' | 'material' | 'kg'>,
  modo: ModoCopia,
): Promise<{ tipo: 'creada'; id: string } | { tipo: 'sin-ubicacion'; ruta: string }> {
  try {
    const nueva = await pedir<{ id: string }>(`/publicaciones/${publicacion.id}/${modo}`, {
      cuerpo: {},
      cabeceras: cabecerasDeUbicacion(ubicacionActual()),
    });
    return { tipo: 'creada', id: nueva.id };
  } catch (causa) {
    if (causa instanceof ErrorApi && causa.codigo === 'UBICACION_REQUERIDA') {
      return { tipo: 'sin-ubicacion', ruta: `${RUTAS.publicar}?m=${publicacion.material.codigo}&kg=${publicacion.kg}` };
    }
    throw causa;
  }
}
