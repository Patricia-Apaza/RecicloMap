'use client';

import type { CodigoMaterial } from '@reciclomap/shared';
import { useMemo, useSyncExternalStore } from 'react';
import { ErrorApi } from '@/sesion/api';

// Borrador de una publicación hecho sin señal: queda en este celular, sin fotos ni ubicación. No se envía solo: la persona lo revisa y lo publica cuando vuelve la conexión
export type PublicacionPendiente = {
  material: CodigoMaterial;
  kg: number;
  precioEsperado: number | null;
  nota: string | null;
  guardadaEn: string;
};

const CLAVE = 'rm_publicacion_pendiente';
const EVENTO = 'rm-pendiente-cambio';

function textoGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function escuchar(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener('storage', avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener('storage', avisar);
  };
}

// El borrador se lee del navegador sin tocar lo que el servidor dibujó: se muestra al hidratar y se actualiza solo
export function usePendiente(): PublicacionPendiente | null {
  const texto = useSyncExternalStore(escuchar, textoGuardado, () => null);
  return useMemo(() => {
    try {
      return texto ? (JSON.parse(texto) as PublicacionPendiente) : null;
    } catch {
      return null;
    }
  }, [texto]);
}

export function leerPendiente(): PublicacionPendiente | null {
  try {
    const texto = localStorage.getItem(CLAVE);
    return texto ? (JSON.parse(texto) as PublicacionPendiente) : null;
  } catch {
    return null;
  }
}

export function guardarPendiente(datos: Omit<PublicacionPendiente, 'guardadaEn'>): boolean {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...datos, guardadaEn: new Date().toISOString() }));
    window.dispatchEvent(new Event(EVENTO));
    return true;
  } catch {
    return false;
  }
}

export function borrarPendiente(): void {
  try {
    localStorage.removeItem(CLAVE);
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Nada que borrar
  }
}

export const sinConexion = (causa: unknown) =>
  (causa instanceof ErrorApi && causa.codigo === 'SIN_CONEXION') ||
  (typeof navigator !== 'undefined' && navigator.onLine === false);
