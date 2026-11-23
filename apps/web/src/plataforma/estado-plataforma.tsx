'use client';

import { type EstadoOperativo, TEXTO_DEMOSTRACION } from '@reciclomap/shared';
import { useCallback, useEffect, useState } from 'react';
import { Icono } from '@/diseno/icono';

const CLAVE_CERRADO = 'rm_banner_cerrado';
const CADA_MS = 5 * 60_000;

const leerCerrado = (): number | null => {
  try {
    const valor = localStorage.getItem(CLAVE_CERRADO);
    return valor ? Number(valor) : null;
  } catch {
    return null;
  }
};

// El estado público de la plataforma: aviso global, registro abierto o cerrado y mantenimiento
let ultimo: EstadoOperativo | null = null;
const oyentes = new Set<(estado: EstadoOperativo | null) => void>();
async function cargar(): Promise<void> {
  try {
    const r = await fetch('/api/v1/estado', { cache: 'no-store' });
    if (!r.ok) return;
    ultimo = (await r.json()) as EstadoOperativo;
    for (const oyente of oyentes) oyente(ultimo);
  } catch {
    // Sin conexión se conserva lo último que se supo
  }
}

export function useEstadoPlataforma(): EstadoOperativo | null {
  const [estado, setEstado] = useState<EstadoOperativo | null>(ultimo);
  useEffect(() => {
    oyentes.add(setEstado);
    if (!ultimo) void cargar();
    return () => {
      oyentes.delete(setEstado);
    };
  }, []);
  return estado;
}

// Se muestra arriba en todas las pantallas, también al invitado
export function AvisosDePlataforma() {
  const estado = useEstadoPlataforma();
  // Sin estado todavía no se pinta nada, así que leer el aviso cerrado al empezar no cambia lo que llegó del servidor
  const [cerrado, setCerrado] = useState<number | null>(() => (typeof window === 'undefined' ? null : leerCerrado()));
  useEffect(() => {
    void cargar();
    const intervalo = setInterval(() => void cargar(), CADA_MS);
    const alVolver = () => void cargar();
    window.addEventListener('focus', alVolver);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('focus', alVolver);
    };
  }, []);
  const cerrar = useCallback((id: number) => {
    try {
      localStorage.setItem(CLAVE_CERRADO, String(id));
    } catch {
      // Sin espacio: se cierra solo en esta visita
    }
    setCerrado(id);
  }, []);

  if (!estado) return null;
  const banner = estado.banner && estado.banner.id !== cerrado ? estado.banner : null;
  return (
    <>
      {estado.demostracion && (
        <div className="aviso-global aviso-demostracion" role="status" data-aviso="demostracion">
          <Icono nombre="i-info" tamano="sm" />
          <span>
            <b>{TEXTO_DEMOSTRACION}</b>
          </span>
        </div>
      )}
      {estado.mantenimiento.activo && (
        <div className="aviso-global aviso-mantenimiento" role="status" data-aviso="mantenimiento">
          <Icono nombre="i-alert" tamano="sm" />
          <span>
            <b>Mantenimiento: solo lectura.</b> {estado.mantenimiento.mensaje} Tus plazos no corren y no pierdes nada.
          </span>
        </div>
      )}
      {banner && (
        <div className="aviso-global aviso-banner" role="status" data-aviso="banner">
          <Icono nombre="i-info" tamano="sm" />
          <span>{banner.texto}</span>
          <button type="button" className="aviso-cerrar" aria-label="Cerrar el aviso" onClick={() => cerrar(banner.id)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
