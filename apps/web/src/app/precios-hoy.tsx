'use client';

import type { CodigoMaterial } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { Icono } from '@/diseno/icono';
import { pedir } from '@/sesion/api';

type Referencia = {
  ciudad: { nombre: string } | null;
  materiales: Array<{ codigo: CodigoMaterial; nombre: string; min: string; max: string }>;
};

let pendiente: Promise<Referencia | null> | null = null;

// Una sola consulta para la cinta y las tarjetas de la bienvenida
function cargarReferencia(): Promise<Referencia | null> {
  pendiente ??= pedir<Referencia>('/precios/referencia').catch(() => null);
  return pendiente;
}

function useReferencia(): Referencia | null {
  const [referencia, setReferencia] = useState<Referencia | null>(null);
  useEffect(() => {
    let vigente = true;
    void cargarReferencia().then((datos) => vigente && setReferencia(datos));
    return () => {
      vigente = false;
    };
  }, []);
  return referencia;
}

// Mínimo y máximo reales de hoy; un material sin precios no se muestra
export function CintaPrecios({ clases }: { clases: { cinta?: string; fila?: string; item?: string } }) {
  const referencia = useReferencia();
  if (!referencia?.ciudad || referencia.materiales.length === 0) return null;
  const items = Array.from({ length: 4 }, () => referencia.materiales).flat();
  return (
    <div className={clases.cinta} aria-label={`Precios de hoy en ${referencia.ciudad.nombre}`}>
      <div className={clases.fila}>
        {items.map((material, indice) => (
          <div key={indice} className={clases.item} aria-hidden={indice >= referencia.materiales.length}>
            <Icono nombre={ICONO_MATERIAL[material.codigo]} />
            {material.nombre}
            <b>
              S/ {material.min}–{material.max}
            </b>
            <span>/kg · hoy en {referencia.ciudad?.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RangoMaterial({ codigo, clase }: { codigo: CodigoMaterial; clase?: string }) {
  const referencia = useReferencia();
  const material = referencia?.materiales.find((item) => item.codigo === codigo);
  if (!material) return null;
  return (
    <div className={clase}>
      S/ {material.min}–{material.max} <small>/kg hoy</small>
    </div>
  );
}
