'use client';

import { useEffect, useState } from 'react';
import { pedir } from '@/sesion/api';

// Carga de una ruta de la API; cambiar `version` vuelve a pedirla
export function useDatos<T>(ruta: string, version = 0): { datos: T | null; fallo: boolean } {
  const [estado, setEstado] = useState<{ datos: T | null; fallo: boolean }>({ datos: null, fallo: false });
  useEffect(() => {
    let vigente = true;
    pedir<T>(ruta)
      .then((datos) => vigente && setEstado({ datos, fallo: false }))
      .catch(() => vigente && setEstado((anterior) => ({ ...anterior, fallo: true })));
    return () => {
      vigente = false;
    };
  }, [ruta, version]);
  return estado;
}
