'use client';

import { type Semaforo, TEXTO_SEMAFORO } from '@reciclomap/shared';
import { useEffect, useRef, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { cargarGoogleMaps, JULIACA } from './google-maps';
import s from './mapa.module.css';
import type { Opcion } from './resultados';

const CLASE_SEMAFORO: Record<Semaforo, string> = {
  MEJOR: 'best',
  INTERMEDIO: 'mid',
  BAJO: 'low',
  SIN_COMPARACION: 'none',
};

function contenidoPin(opcion: Opcion, elegido: boolean): HTMLElement {
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = [s.pin, opcion.tipo === 'MOVIL' ? s.pinMovil : '', elegido ? s.pinElegido : ''].join(' ');
  const medio = (Number(opcion.precio.min) + Number(opcion.precio.max)) / 2;
  pin.setAttribute('aria-label', `${opcion.nombre}, S/ ${medio.toFixed(2)} por kilo, ${opcion.semaforo.texto}`);
  const etiqueta = document.createElement('span');
  etiqueta.className = s.pinEtiqueta ?? '';
  const precio = document.createElement('b');
  precio.textContent = `S/ ${medio.toFixed(2)}`;
  const semaforo = document.createElement('span');
  semaforo.className = `tag ${CLASE_SEMAFORO[opcion.semaforo.clave]}`;
  semaforo.textContent = TEXTO_SEMAFORO[opcion.semaforo.clave].corto;
  etiqueta.append(precio, semaforo);
  const punto = document.createElement('span');
  punto.className = s.pinPunto ?? '';
  pin.append(etiqueta, punto);
  return pin;
}

function contenidoYo(): HTMLElement {
  const yo = document.createElement('div');
  yo.className = s.yo ?? '';
  const texto = document.createElement('span');
  texto.textContent = 'Tú · ubicación aproximada';
  yo.append(texto, document.createElement('i'));
  return yo;
}

type Props = {
  clave: string;
  idMapa: string;
  opciones: Opcion[];
  centro: { lat: number; lng: number } | null;
  radioKm: number;
  elegido: string | null;
  alElegir: (id: string) => void;
};

// Mapa de resultados: los mismos negocios y el mismo semáforo que la lista, nunca otros
export function MapaResultados({ clave, idMapa, opciones, centro, radioKm, elegido, alElegir }: Props) {
  const lienzo = useRef<HTMLDivElement>(null);
  const mapa = useRef<google.maps.Map | null>(null);
  const circulo = useRef<google.maps.Circle | null>(null);
  const marcadores = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const yo = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [error, setError] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    cargarGoogleMaps(clave)
      .then(async (maps) => {
        await maps.importLibrary('marker');
        if (!vigente || !lienzo.current || mapa.current) return;
        mapa.current = new maps.Map(lienzo.current, {
          center: centro ?? JULIACA,
          zoom: 13,
          mapId: idMapa,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        setListo(true);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
    // El mapa se crea una sola vez; los cambios se aplican en el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, idMapa]);

  useEffect(() => {
    const instancia = mapa.current;
    if (!listo || !instancia) return;
    for (const marcador of marcadores.current) marcador.map = null;
    marcadores.current = opciones.map((opcion) => {
      const marcador = new google.maps.marker.AdvancedMarkerElement({
        map: instancia,
        position: opcion.posicion,
        title: opcion.nombre,
        content: contenidoPin(opcion, opcion.id === elegido),
        zIndex: opcion.id === elegido ? 30 : 2,
      });
      marcador.addListener('click', () => alElegir(opcion.id));
      return marcador;
    });

    circulo.current?.setMap(null);
    if (yo.current) yo.current.map = null;
    if (centro) {
      circulo.current = new google.maps.Circle({
        map: instancia,
        center: centro,
        radius: radioKm * 1000,
        strokeColor: '#1F5A48',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#B7E36B',
        fillOpacity: 0.13,
        clickable: false,
      });
      yo.current = new google.maps.marker.AdvancedMarkerElement({
        map: instancia,
        position: centro,
        content: contenidoYo(),
        zIndex: 4,
      });
      const limites = circulo.current.getBounds();
      if (limites) instancia.fitBounds(limites, 24);
    } else if (opciones.length > 0) {
      const limites = new google.maps.LatLngBounds();
      for (const opcion of opciones) limites.extend(opcion.posicion);
      instancia.fitBounds(limites, 48);
    }
  }, [listo, opciones, centro, radioKm, elegido, alElegir]);

  if (error) {
    return (
      <div className={s.sinMapa}>
        <p className="mini">No pudimos cargar el mapa. La lista muestra los mismos resultados.</p>
      </div>
    );
  }
  return (
    <>
      <div ref={lienzo} className={s.lienzo} role="application" aria-label="Mapa con los compradores de la lista" />
      {!listo && (
        <div className={s.sinMapa}>
          <span className="girando" aria-hidden="true" />
        </div>
      )}
      <div className={s.nota}>
        <Icono nombre="i-lock" tamano="sm" />
        Tu ubicación exacta no se comparte
      </div>
    </>
  );
}
