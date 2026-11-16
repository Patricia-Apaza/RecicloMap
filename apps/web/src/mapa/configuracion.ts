'use client';

import { useEffect, useState } from 'react';
import { pedir } from '@/sesion/api';

export type ConfiguracionPublica = {
  radiosKm: number[];
  radioDefectoKm: number;
  diasPrecioAlDia: number;
  precioKg: { minimo: string; maximo: string };
  googleMaps: { clave: string; idMapa: string } | null;
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
