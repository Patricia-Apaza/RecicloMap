'use client';

import { type CodigoMaterial, NOMBRE_MATERIAL } from '@reciclomap/shared';
import { useEffect, useRef } from 'react';
import { useAviso } from '@/diseno/avisos';
import { cabecerasDeUbicacion, ubicacionActual } from '@/mapa/ubicacion';
import { ErrorApi, pedir } from '@/sesion/api';

// Publicación hecha sin señal: queda en este celular, sin fotos ni ubicación, hasta que vuelva la conexión
export type PublicacionPendiente = {
  material: CodigoMaterial;
  kg: number;
  precioEsperado: number | null;
  nota: string | null;
  guardadaEn: string;
};

const CLAVE = 'rm_publicacion_pendiente';

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
    return true;
  } catch {
    return false;
  }
}

export function borrarPendiente(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar
  }
}

export const sinConexion = (causa: unknown) =>
  (causa instanceof ErrorApi && causa.codigo === 'SIN_CONEXION') ||
  (typeof navigator !== 'undefined' && navigator.onLine === false);

// Al volver la señal se publica sola y se avisa; si falta la ubicación, se pide abrir Publicar
export function usePublicacionPendiente(activo: boolean): void {
  const aviso = useAviso();
  const enviando = useRef(false);
  useEffect(() => {
    if (!activo) return;
    const intentar = async () => {
      const pendiente = leerPendiente();
      if (!pendiente || enviando.current || navigator.onLine === false) return;
      const cabeceras = cabecerasDeUbicacion(ubicacionActual());
      enviando.current = true;
      try {
        const { material, kg, precioEsperado, nota } = pendiente;
        await pedir('/publicaciones', { cuerpo: { material, kg, precioEsperado, nota }, cabeceras });
        borrarPendiente();
        aviso(
          `Volvió la señal: publicamos tu ${NOMBRE_MATERIAL[material]} de ${kg} kg. Ya puedes agregarle fotos desde Mis publicaciones.`,
        );
      } catch (causa) {
        if (causa instanceof ErrorApi && causa.codigo === 'UBICACION_REQUERIDA') {
          aviso('Tienes una publicación sin enviar. Abre Publicar para elegir tu zona y enviarla.');
        } else if (causa instanceof ErrorApi && causa.estado >= 400 && causa.estado < 500) {
          borrarPendiente();
          aviso(`No pudimos publicar lo que guardaste sin señal: ${causa.message}`);
        }
      } finally {
        enviando.current = false;
      }
    };
    void intentar();
    const alVolver = () => void intentar();
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [activo, aviso]);
}
