'use client';

import { redondearPosicion } from '@reciclomap/shared';
import { useCallback, useSyncExternalStore } from 'react';

// Posición redondeada a unos 100 m (solo en esta pestaña) o zona elegida a mano (se recuerda en este celular)
export type Ubicacion =
  { modo: 'posicion'; posicion: string } | { modo: 'zona'; zonaId: number; zonaNombre: string } | null;

const CLAVE_POSICION = 'rm_posicion';
const CLAVE_ZONA = 'rm_zona';
const oyentes = new Set<() => void>();
let enMemoria: Ubicacion = null;
let instantanea: Ubicacion | undefined;

function leerAlmacen(): Ubicacion {
  try {
    const posicion = sessionStorage.getItem(CLAVE_POSICION);
    if (posicion) return { modo: 'posicion', posicion };
    const zona = localStorage.getItem(CLAVE_ZONA);
    if (zona) {
      const datos = JSON.parse(zona) as { zonaId: number; zonaNombre: string };
      if (Number.isInteger(datos.zonaId)) return { modo: 'zona', ...datos };
    }
  } catch {
    // Sin almacenamiento la ubicación dura solo mientras la pantalla esté abierta
  }
  return enMemoria;
}

export function ubicacionActual(): Ubicacion {
  return leer();
}

function leer(): Ubicacion {
  instantanea ??= leerAlmacen();
  return instantanea;
}

function fijar(ubicacion: Ubicacion): void {
  enMemoria = ubicacion;
  instantanea = ubicacion;
  try {
    sessionStorage.removeItem(CLAVE_POSICION);
    if (ubicacion?.modo === 'posicion') sessionStorage.setItem(CLAVE_POSICION, ubicacion.posicion);
    if (ubicacion?.modo === 'zona')
      localStorage.setItem(CLAVE_ZONA, JSON.stringify({ zonaId: ubicacion.zonaId, zonaNombre: ubicacion.zonaNombre }));
  } catch {
    // Se queda en memoria
  }
  for (const oyente of oyentes) oyente();
}

function escuchar(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function cabecerasDeUbicacion(ubicacion: Ubicacion): Record<string, string> {
  if (ubicacion?.modo === 'posicion') return { 'X-Posicion': ubicacion.posicion };
  if (ubicacion?.modo === 'zona') return { 'X-Zona': String(ubicacion.zonaId) };
  return {};
}

export const TEXTO_PERMISO = 'Usamos tu ubicación solo para calcular distancias; nunca se muestra a nadie.';

export function useUbicacion() {
  const ubicacion = useSyncExternalStore(escuchar, leer, () => null);

  // El navegador pregunta; la posición se redondea aquí mismo antes de salir del celular
  const usarPosicion = useCallback(
    () =>
      new Promise<boolean>((resolver) => {
        if (!('geolocation' in navigator)) {
          resolver(false);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            fijar({ modo: 'posicion', posicion: redondearPosicion(coords.latitude, coords.longitude) });
            resolver(true);
          },
          () => resolver(false),
          { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
        );
      }),
    [],
  );

  const elegirZona = useCallback(
    (zonaId: number, zonaNombre: string) => fijar({ modo: 'zona', zonaId, zonaNombre }),
    [],
  );
  const olvidar = useCallback(() => fijar(null), []);

  return { ubicacion, usarPosicion, elegirZona, olvidar, cabeceras: cabecerasDeUbicacion(ubicacion) };
}
