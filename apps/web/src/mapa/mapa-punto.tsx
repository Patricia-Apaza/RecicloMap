'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConfigMapa } from './configuracion';
import { cargarLeaflet, crearMapaBase, marcadorHtml } from './leaflet';
import { MapaPuntoGoogle } from './mapa-punto-google';
import s from './mapa.module.css';

type Props = { mapa: ConfigMapa; punto: { lat: number; lng: number }; etiqueta: string };

// Mapa pequeño con un solo punto público: el local del centro o el centro de la zona del móvil
export function MapaPunto({ mapa, punto, etiqueta }: Props) {
  if (mapa.proveedor === 'google' && mapa.google) {
    return <MapaPuntoGoogle clave={mapa.google.clave} idMapa={mapa.google.idMapa} punto={punto} etiqueta={etiqueta} />;
  }
  return <MapaPuntoLeaflet mapa={mapa} punto={punto} etiqueta={etiqueta} />;
}

function MapaPuntoLeaflet({ mapa, punto, etiqueta }: Props) {
  const lienzo = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vigente = true;
    let instancia: { remove: () => void } | null = null;
    void cargarLeaflet()
      .then((L) => {
        if (!vigente || !lienzo.current) return;
        const m = crearMapaBase(L, lienzo.current, mapa, {
          centro: punto,
          zoom: 15,
          rueda: false,
          alFallar: () => vigente && setError(true),
        });
        const pin = document.createElement('span');
        pin.className = s.pinPunto ?? '';
        marcadorHtml(L, punto, pin, { titulo: etiqueta, centrado: true }).addTo(m);
        instancia = m;
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
      instancia?.remove();
    };
  }, [mapa, punto, etiqueta]);
  if (error) return null;
  return <div ref={lienzo} style={{ position: 'absolute', inset: 0 }} role="region" aria-label={etiqueta} />;
}
