'use client';

import { useEffect, useId, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { pedir } from '@/sesion/api';
import { TEXTO_PERMISO, useUbicacion } from './ubicacion';

type Zona = { id: number; nombre: string };

export function useZonasActivas(): Zona[] | null {
  const [zonas, setZonas] = useState<Zona[] | null>(null);
  useEffect(() => {
    let vigente = true;
    (async () => {
      const ciudades = await pedir<{ datos: Array<{ id: number; estado: string }> }>('/ciudades');
      const activa = ciudades.datos.find((ciudad) => ciudad.estado === 'ACTIVA');
      return activa ? (await pedir<{ datos: Zona[] }>(`/ciudades/${activa.id}/zonas`)).datos : [];
    })()
      .then((lista) => vigente && setZonas(lista))
      .catch(() => vigente && setZonas([]));
    return () => {
      vigente = false;
    };
  }, []);
  return zonas;
}

// Antes del primer resultado: ubicación con permiso o zona a mano; sin ubicación la app funciona igual
export function PedirUbicacion({ compacto = false }: { compacto?: boolean }) {
  const { ubicacion, usarPosicion, elegirZona } = useUbicacion();
  const zonas = useZonasActivas();
  const id = useId();
  const [negada, setNegada] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  const pedirPosicion = async () => {
    setPidiendo(true);
    const concedida = await usarPosicion();
    setPidiendo(false);
    setNegada(!concedida);
  };

  return (
    <div
      className="panel"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: compacto ? 16 : 22 }}
      role="region"
      aria-label="Tu ubicación"
    >
      {!compacto && <h2 style={{ margin: 0 }}>¿Desde dónde buscas?</h2>}
      <div className="note">
        <Icono nombre="i-lock" />
        <span>{TEXTO_PERMISO}</span>
      </div>
      {negada && (
        <p className="mini" style={{ margin: 0, color: 'var(--color-peligro)' }}>
          No pudimos usar tu ubicación. Elige tu zona: la app funciona igual.
        </p>
      )}
      <button type="button" className="btn p" onClick={() => void pedirPosicion()} disabled={pidiendo}>
        <Icono nombre="i-pin" />
        {pidiendo
          ? 'Buscando tu ubicación…'
          : ubicacion?.modo === 'posicion'
            ? 'Actualizar mi ubicación'
            : 'Usar mi ubicación'}
      </button>
      <div className="field">
        <label htmlFor={id}>O elige tu zona</label>
        <div className="inp">
          <Icono nombre="i-map" />
          <select
            id={id}
            value={ubicacion?.modo === 'zona' ? ubicacion.zonaId : ''}
            disabled={!zonas}
            onChange={(evento) => {
              const zona = zonas?.find((opcion) => opcion.id === Number(evento.target.value));
              if (zona) elegirZona(zona.id, zona.nombre);
            }}
          >
            <option value="" disabled>
              {zonas ? 'Elige una zona' : 'Cargando zonas…'}
            </option>
            {(zonas ?? []).map((zona) => (
              <option key={zona.id} value={zona.id}>
                {zona.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function TextoUbicacion() {
  const { ubicacion, olvidar } = useUbicacion();
  if (!ubicacion) return null;
  return (
    <span className="mini row g8" style={{ gap: 6 }}>
      <Icono nombre="i-lock" tamano="sm" />
      {ubicacion.modo === 'posicion' ? 'Desde tu ubicación aproximada' : `Desde ${ubicacion.zonaNombre}`}
      <button type="button" className="btn ghost sm" style={{ height: 28, padding: '0 8px' }} onClick={olvidar}>
        Cambiar
      </button>
    </span>
  );
}
