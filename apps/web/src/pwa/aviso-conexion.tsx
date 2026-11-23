'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icono } from '@/diseno/icono';
import { datosDeCopia, escucharDatosDeCopia } from './datos-guardados';

const escucharConexion = (aviso: () => void) => {
  window.addEventListener('online', aviso);
  window.addEventListener('offline', aviso);
  return () => {
    window.removeEventListener('online', aviso);
    window.removeEventListener('offline', aviso);
  };
};

export const fechaYHoraLima = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// Sin conexión se puede leer lo ya visto, con su fecha; lo que cambia datos se desactiva con un aviso
export function AvisoConexion() {
  const enLinea = useSyncExternalStore(
    escucharConexion,
    () => navigator.onLine,
    () => true,
  );
  const [copia, setCopia] = useState<string | null>(datosDeCopia());
  useEffect(() => escucharDatosDeCopia(setCopia), []);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-sin-conexion', !enLinea);
  }, [enLinea]);

  if (enLinea) return null;
  return (
    <div className="aviso-global aviso-sin-conexion" role="status" data-aviso="sin-conexion">
      <Icono nombre="i-alert" tamano="sm" />
      <span>
        <b>{copia ? `Sin conexión · datos de ${fechaYHoraLima(copia)}` : 'Sin conexión'}</b>. Puedes ver lo que ya
        abriste. Para publicar, ofertar, cambiar precios o cualquier cambio necesitas internet: no se guarda para
        después.
      </span>
    </div>
  );
}
