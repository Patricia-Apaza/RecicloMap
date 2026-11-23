'use client';

import { esquemaFiltrosMapa, type FiltrosMapa } from '@reciclomap/shared';
import { useCallback, useSyncExternalStore } from 'react';

// Los mismos filtros en el mapa, la lista y la búsqueda (09, 10 y 11); se recuerdan en este celular
const CLAVE = 'rm_filtros';
export const FILTROS_INICIALES: FiltrosMapa = esquemaFiltrosMapa.parse({ material: 'pet' });
const oyentes = new Set<() => void>();
let actuales: FiltrosMapa | undefined;

function leer(): FiltrosMapa {
  if (actuales) return actuales;
  try {
    const guardados = esquemaFiltrosMapa.safeParse(JSON.parse(localStorage.getItem(CLAVE) ?? 'null'));
    actuales = guardados.success ? guardados.data : FILTROS_INICIALES;
  } catch {
    actuales = FILTROS_INICIALES;
  }
  return actuales;
}

function guardar(filtros: FiltrosMapa): void {
  actuales = filtros;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(filtros));
  } catch {
    // Quedan en memoria
  }
  for (const oyente of oyentes) oyente();
}

function escuchar(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function consultaDeFiltros(filtros: FiltrosMapa): string {
  const parametros = new URLSearchParams({
    material: filtros.material,
    radio: String(filtros.radio),
    tipo: filtros.tipo,
    orden: filtros.orden,
  });
  if (filtros.pagos.length > 0) parametros.set('pagos', filtros.pagos.join(','));
  if (filtros.demandaMinima) parametros.set('demandaMinima', filtros.demandaMinima);
  if (filtros.soloAbiertos) parametros.set('soloAbiertos', 'true');
  if (filtros.soloAlDia) parametros.set('soloAlDia', 'true');
  return parametros.toString();
}

export function useFiltrosMapa() {
  const filtros = useSyncExternalStore(escuchar, leer, () => FILTROS_INICIALES);
  const cambiar = useCallback((cambio: Partial<FiltrosMapa>) => guardar({ ...leer(), ...cambio }), []);
  const reemplazar = useCallback((nuevos: FiltrosMapa) => guardar(nuevos), []);
  return { filtros, cambiar, reemplazar };
}
