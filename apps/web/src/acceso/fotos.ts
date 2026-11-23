'use client';

import { useEffect, useState } from 'react';
import { ErrorApi, pedir, pedirArchivo } from '@/sesion/api';

const LADO_MAXIMO = 1600;
const CALIDAD = 0.82;
export const TIPOS_ACEPTADOS = 'image/jpeg,image/png,image/webp';
const TAMANO_MAXIMO = 8 * 1024 * 1024;

export type FotoSubida = { id: string };

// Se achica en el celular antes de subirla: gasta menos datos. El servidor la vuelve a procesar sin metadatos
export async function comprimirFoto(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) {
    throw new ErrorApi('FOTO_NO_VALIDA', 'Elige una foto en formato JPG, PNG o WebP.', 422);
  }
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    if (archivo.size > TAMANO_MAXIMO) throw new ErrorApi('ARCHIVO_MUY_GRANDE', 'La foto pesa más de 8 MB.', 413);
    return archivo;
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d')?.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  const comprimida = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, 'image/jpeg', CALIDAD));
  return comprimida ?? archivo;
}

export async function subirFoto(archivo: File, proposito: 'PERFIL' | 'NEGOCIO' | 'PUBLICACION'): Promise<FotoSubida> {
  const datos = new FormData();
  datos.append('proposito', proposito);
  datos.append('foto', await comprimirFoto(archivo), 'foto.jpg');
  return pedir<FotoSubida>('/fotos', { formulario: datos });
}

export function quitarFoto(id: string): Promise<void> {
  return pedir<void>(`/fotos/${id}`, { metodo: 'DELETE' });
}

// Las fotos del registro son privadas: se piden con la sesión y se muestran desde memoria
export function useFotoProtegida(id: string | null | undefined, tamano: 'mini' | 'completa' = 'mini'): string | null {
  const [cargada, setCargada] = useState<{ clave: string; url: string | null } | null>(null);
  const clave = id ? `${id}:${tamano}` : null;
  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    let creada: string | null = null;
    pedirArchivo(`/fotos/${clave.replace(':', '?tamano=')}`)
      .then((blob) => {
        if (!vigente) return;
        creada = URL.createObjectURL(blob);
        setCargada({ clave, url: creada });
      })
      .catch(() => {
        if (vigente) setCargada({ clave, url: null });
      });
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [clave]);
  return cargada && cargada.clave === clave ? cargada.url : null;
}
