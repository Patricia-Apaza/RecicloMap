'use client';

import type { CodigoMaterial } from '@reciclomap/shared';
import { useCallback, useEffect, useState } from 'react';
import { pedir } from '@/sesion/api';
import type { PublicacionCercana } from './tipos';

export type RangoPropio = { min: string; max: string };

// Publicaciones abiertas de la ciudad y los rangos propios, para el aviso "Tu rango publicado"
type Pagina = { total: number; pagina: number; porPagina: number; datos: PublicacionCercana[] };
const POR_PAGINA = 20;

// Ciudades grandes: se piden de a 20, de la más cercana a la más lejana
export function usePublicacionesCercanas(material: CodigoMaterial | null) {
  const [datos, setDatos] = useState<PublicacionCercana[] | null>(null);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [rangos, setRangos] = useState<Partial<Record<CodigoMaterial, RangoPropio>>>({});
  const [error, setError] = useState(false);
  const base = `/negocio/publicaciones?porPagina=${POR_PAGINA}${material ? `&material=${material}` : ''}`;

  // Recargar trae de nuevo todas las páginas ya vistas, para reflejar una oferta recién enviada
  const recargar = useCallback(async () => {
    const respuestas = await Promise.all(
      Array.from({ length: paginas }, (_, i) => pedir<Pagina>(`${base}&pagina=${i + 1}`)),
    );
    setDatos(respuestas.flatMap((r) => r.datos));
    setTotal(respuestas[0]?.total ?? 0);
  }, [base, paginas]);

  const cargarMas = useCallback(async () => {
    const siguiente = paginas + 1;
    const respuesta = await pedir<Pagina>(`${base}&pagina=${siguiente}`);
    setDatos((actuales) => [...(actuales ?? []), ...respuesta.datos]);
    setTotal(respuesta.total);
    setPaginas(siguiente);
  }, [base, paginas]);

  useEffect(() => {
    let vigente = true;
    pedir<Pagina>(`${base}&pagina=1`)
      .then((respuesta) => {
        if (!vigente) return;
        setDatos(respuesta.datos);
        setTotal(respuesta.total);
        setPaginas(1);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [base]);

  useEffect(() => {
    let vigente = true;
    pedir<{
      materiales: Array<{
        material: { codigo: CodigoMaterial };
        activo: boolean;
        min: string | null;
        max: string | null;
      }>;
    }>('/mi-negocio/precios')
      .then((respuesta) => {
        if (!vigente) return;
        const propios: Partial<Record<CodigoMaterial, RangoPropio>> = {};
        for (const fila of respuesta.materiales) {
          if (fila.activo && fila.min && fila.max) propios[fila.material.codigo] = { min: fila.min, max: fila.max };
        }
        setRangos(propios);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  return { datos, total, rangos, error, recargar, cargarMas, hayMas: (datos?.length ?? 0) < total };
}
