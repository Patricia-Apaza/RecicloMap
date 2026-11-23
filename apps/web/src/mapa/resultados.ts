'use client';

import type { CodigoMaterial, Demanda, FiltrosMapa, Semaforo } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { ErrorApi, pedir } from '@/sesion/api';
import { consultaDeFiltros } from './filtros';
import { cabecerasDeUbicacion, type Ubicacion } from './ubicacion';

export type EstadoApertura = { abierto: boolean | null; texto: string; tono: 'open' | 'closed' | 'warn' | 'grey' };
export type SemaforoCalculado = { clave: Semaforo; texto: string; comparadoEntre: number };

export type Opcion = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  vehiculo: string | null;
  esPro: boolean;
  destacado: boolean;
  distanciaKm: number;
  zona: string | null;
  posicion: { lat: number; lng: number };
  calificacion: { promedio: number | null; cantidad: number; nuevo: boolean };
  estado: EstadoApertura;
  pagos: string[];
  precio: { min: string; max: string; actualizadoEn: string; antiguo: boolean };
  semaforo: SemaforoCalculado;
  demanda: Demanda;
};

export type Resultados = {
  material: { codigo: CodigoMaterial; nombre: string };
  radioKm: number;
  comparadoEntre: number;
  opciones: Opcion[];
};

type Estado = { clave: string; cargando: boolean; datos: Resultados | null; error: string | null };

// Los resultados vienen del servidor con el semáforo ya calculado: la web nunca lo calcula
export function useResultados(filtros: FiltrosMapa, ubicacion: Ubicacion): Estado {
  const consulta = consultaDeFiltros(filtros);
  const cabeceras = cabecerasDeUbicacion(ubicacion);
  const clave = `${consulta}|${JSON.stringify(cabeceras)}`;
  const [estado, setEstado] = useState<Estado>({ clave: '', cargando: false, datos: null, error: null });

  useEffect(() => {
    if (!ubicacion) return;
    const control = new AbortController();
    pedir<Resultados>(`/compradores?${consulta}`, { cabeceras: cabecerasDeUbicacion(ubicacion), senal: control.signal })
      .then((datos) => setEstado({ clave, cargando: false, datos, error: null }))
      .catch((causa: unknown) => {
        if (control.signal.aborted) return;
        setEstado({
          clave,
          cargando: false,
          datos: null,
          error: causa instanceof ErrorApi ? causa.message : 'No pudimos cargar los resultados.',
        });
      });
    return () => control.abort();
  }, [clave, consulta, ubicacion]);

  if (!ubicacion) return { clave, cargando: false, datos: null, error: null };
  // Mientras llega la respuesta nueva se muestra la anterior, marcada como cargando
  return estado.clave === clave ? estado : { ...estado, clave, cargando: true };
}

export const TEXTO_VEHICULO: Record<string, string> = {
  MOTO: 'Moto',
  TRICICLO: 'Triciclo',
  CAMIONETA: 'Camioneta',
  CAMION: 'Camión',
};
export const TEXTO_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TRANSFERENCIA: 'Transferencia',
};
export const RUTA_DETALLE = (id: string) => `/negocios/${id}`;

export function hace(fecha: string): string {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  if (dias < 8) return `hace ${dias} días`;
  return 'hace más de una semana';
}
