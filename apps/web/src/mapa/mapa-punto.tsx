'use client';

import { useEffect, useRef, useState } from 'react';
import { cargarGoogleMaps } from './google-maps';

// Mapa pequeño con un solo punto público: el local del centro o el centro de la zona del móvil
export function MapaPunto({
  clave,
  idMapa,
  punto,
  etiqueta,
}: {
  clave: string;
  idMapa: string;
  punto: { lat: number; lng: number };
  etiqueta: string;
}) {
  const lienzo = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vigente = true;
    cargarGoogleMaps(clave)
      .then(async (maps) => {
        await maps.importLibrary('marker');
        if (!vigente || !lienzo.current) return;
        const mapa = new maps.Map(lienzo.current, {
          center: punto,
          zoom: 15,
          mapId: idMapa,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        new google.maps.marker.AdvancedMarkerElement({ map: mapa, position: punto, title: etiqueta });
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [clave, idMapa, punto, etiqueta]);
  if (error) return null;
  return <div ref={lienzo} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={etiqueta} />;
}
