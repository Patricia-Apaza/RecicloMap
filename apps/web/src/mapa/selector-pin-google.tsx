'use client';

import { useEffect, useRef, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { BuscadorDirecciones } from './buscador-direcciones';
import { useConfiguracionPublica } from './configuracion';
import { cargarGoogleMaps, JULIACA } from './google-maps';

export type Punto = { lat: number; lng: number };

const redondear = (punto: Punto): Punto => ({
  lat: Math.round(punto.lat * 1e6) / 1e6,
  lng: Math.round(punto.lng * 1e6) / 1e6,
});

// Variante con Google Maps (si el equipo la eligió): la búsqueda de direcciones es la misma, por nuestro servidor
export function SelectorPinGoogle({
  valor,
  centro,
  alCambiar,
}: {
  valor: Punto | null;
  centro: Punto | null;
  alCambiar: (punto: Punto) => void;
}) {
  const { configuracion, cargando } = useConfiguracionPublica();
  const lienzo = useRef<HTMLDivElement>(null);
  const irA = useRef<((punto: Punto) => void) | null>(null);
  const mapa = useRef<google.maps.Map | null>(null);
  const marcador = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const alCambiarActual = useRef(alCambiar);
  const [error, setError] = useState(false);
  const clave = configuracion?.googleMaps?.clave;

  useEffect(() => {
    alCambiarActual.current = alCambiar;
  }, [alCambiar]);

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    cargarGoogleMaps(clave)
      .then(async (maps) => {
        await maps.importLibrary('marker');
        if (!vigente || !lienzo.current || mapa.current) return;
        const inicio = valor ?? centro ?? JULIACA;
        const instancia = new maps.Map(lienzo.current, {
          center: inicio,
          zoom: valor ? 17 : 15,
          mapId: configuracion?.googleMaps?.idMapa ?? 'DEMO_MAP_ID',
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        mapa.current = instancia;
        const pin = new google.maps.marker.AdvancedMarkerElement({
          map: valor ? instancia : null,
          position: valor,
          gmpDraggable: true,
          title: 'Tu local',
        });
        marcador.current = pin;
        const colocar = (punto: Punto) => {
          pin.position = punto;
          pin.map = instancia;
          alCambiarActual.current(redondear(punto));
        };
        instancia.addListener('click', (evento: google.maps.MapMouseEvent) => {
          if (evento.latLng) colocar(evento.latLng.toJSON());
        });
        pin.addListener('dragend', () => {
          const posicion = pin.position;
          if (posicion)
            colocar(
              posicion instanceof google.maps.LatLng
                ? posicion.toJSON()
                : { lat: Number(posicion.lat), lng: Number(posicion.lng) },
            );
        });
        irA.current = (punto) => {
          instancia.setCenter(punto);
          instancia.setZoom(17);
          colocar(punto);
        };
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
    // El mapa se crea una vez; el centro inicial no lo mueve después
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Si cambia la zona elegida y aún no hay pin, el mapa se centra en ella
  useEffect(() => {
    if (!valor && centro && mapa.current) mapa.current.setCenter(centro);
  }, [centro, valor]);

  if (cargando) return <span className="girando" aria-hidden="true" />;
  if (!clave || error) {
    return (
      <div className="note warn" role="status">
        <Icono nombre="i-alert" />
        <span>
          {clave
            ? 'No pudimos cargar el mapa para colocar el pin. Revisa tu conexión e inténtalo de nuevo.'
            : 'El mapa no está disponible por ahora. Usaremos el centro de tu zona y te pediremos el pin más adelante.'}
          {process.env.NODE_ENV !== 'production' && !clave && (
            <>
              <br />
              <b>Aviso interno:</b> falta GOOGLE_MAPS_CLAVE_NAVEGADOR en el archivo .env de la API.
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <BuscadorDirecciones alElegir={(punto) => irA.current?.(punto)} />
      <div
        ref={lienzo}
        style={{
          height: 320,
          borderRadius: 18,
          border: '2px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          overflow: 'hidden',
          background: '#E9EFEC',
        }}
        role="application"
        aria-label="Mapa para colocar el pin de tu local: toca el lugar exacto"
        data-pin={valor ? `${valor.lat},${valor.lng}` : ''}
      />
      <span className="hint">
        {valor
          ? 'Pin colocado. Puedes arrastrarlo para corregirlo.'
          : 'Busca tu dirección o toca el mapa en el lugar exacto de tu local.'}
      </span>
    </div>
  );
}
