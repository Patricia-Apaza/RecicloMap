'use client';

import { useEffect, useState } from 'react';
import { pedir } from '@/sesion/api';

export type ConfigMapa = {
  proveedor: 'osm' | 'maptiler' | 'google';
  teselas: { url: string; atribucion: string; maxZoom: number } | null;
  google: { clave: string; idMapa: string } | null;
  pinObligatorio: boolean;
};

export type ConfiguracionPublica = {
  radiosKm: number[];
  radioDefectoKm: number;
  diasPrecioAlDia: number;
  precioKg: { minimo: string; maximo: string };
  googleMaps: { clave: string; idMapa: string } | null;
  // El mapa siempre existe: Leaflet con teselas de OpenStreetMap por defecto, o Google si el equipo lo configuró
  mapa: ConfigMapa;
  push?: { clavePublica: string } | null;
  soporte?: { correo: string };
  rutas?: boolean;
};

let pendiente: Promise<ConfiguracionPublica | null> | null = null;

// La clave del mapa llega al arrancar, no al compilar: se puede cambiar sin volver a construir la web
export function cargarConfiguracion(): Promise<ConfiguracionPublica | null> {
  pendiente ??= pedir<ConfiguracionPublica>('/configuracion-publica').catch(() => {
    pendiente = null;
    return null;
  });
  return pendiente;
}

export function useConfiguracionPublica(): { cargando: boolean; configuracion: ConfiguracionPublica | null } {
  const [estado, setEstado] = useState<{ cargando: boolean; configuracion: ConfiguracionPublica | null }>({
    cargando: true,
    configuracion: null,
  });
  useEffect(() => {
    let vigente = true;
    void cargarConfiguracion().then((configuracion) => vigente && setEstado({ cargando: false, configuracion }));
    return () => {
      vigente = false;
    };
  }, []);
  return estado;
}
