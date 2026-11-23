'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { clases } from '@/diseno/clases';
import type { ConfigMapa } from './configuracion';
import { JULIACA } from './google-maps';
import { cargarLeaflet, crearMapaBase, type Leaf, marcadorHtml } from './leaflet';
import s from './mapa.module.css';
import { MapaResultadosGoogle } from './mapa-resultados-google';
import { contenidoPin, contenidoYo } from './pines';
import type { Opcion } from './resultados';

type Props = {
  mapa: ConfigMapa;
  opciones: Opcion[];
  centro: { lat: number; lng: number } | null;
  radioKm: number;
  elegido: string | null;
  alElegir: (id: string) => void;
};

// Mapa de resultados: los mismos negocios y el mismo semáforo que la lista, nunca otros
export function MapaResultados({ mapa, ...resto }: Props) {
  if (mapa.proveedor === 'google' && mapa.google) {
    return <MapaResultadosGoogle clave={mapa.google.clave} idMapa={mapa.google.idMapa} {...resto} />;
  }
  return <MapaResultadosLeaflet mapa={mapa} {...resto} />;
}

function MapaResultadosLeaflet({ mapa, opciones, centro, radioKm, elegido, alElegir }: Props) {
  const lienzo = useRef<HTMLDivElement>(null);
  const instancia = useRef<Leaflet.Map | null>(null);
  const leaf = useRef<Leaf | null>(null);
  const capa = useRef<Leaflet.LayerGroup | null>(null);
  const [error, setError] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    void cargarLeaflet()
      .then((L) => {
        if (!vigente || !lienzo.current || instancia.current) return;
        leaf.current = L;
        instancia.current = crearMapaBase(L, lienzo.current, mapa, { alFallar: () => vigente && setError(true) });
        capa.current = L.layerGroup().addTo(instancia.current);
        setListo(true);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
      instancia.current?.remove();
      instancia.current = null;
      capa.current = null;
      setListo(false);
    };
    // El mapa se crea una sola vez; los cambios se aplican en el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa.proveedor, mapa.teselas?.url]);

  useEffect(() => {
    const L = leaf.current;
    const m = instancia.current;
    const grupo = capa.current;
    if (!listo || !L || !m || !grupo) return;
    grupo.clearLayers();
    const bordes: Leaflet.LatLngExpression[] = [];
    for (const opcion of opciones) {
      const marcador = marcadorHtml(L, opcion.posicion, contenidoPin(opcion, opcion.id === elegido), {
        titulo: opcion.nombre,
        z: opcion.id === elegido ? 1000 : 0,
        dato: opcion.id,
      });
      marcador.on('click', () => alElegir(opcion.id));
      marcador.addTo(grupo);
      bordes.push([opcion.posicion.lat, opcion.posicion.lng]);
    }
    if (centro) {
      const circulo = L.circle([centro.lat, centro.lng], {
        radius: radioKm * 1000,
        color: '#1F5A48',
        opacity: 0.8,
        weight: 2,
        fillColor: '#B7E36B',
        fillOpacity: 0.13,
        interactive: false,
      }).addTo(grupo);
      circulo.on('add', () => circulo.getElement()?.setAttribute('data-radio-metros', String(radioKm * 1000)));
      circulo.getElement()?.setAttribute('data-radio-metros', String(radioKm * 1000));
      marcadorHtml(L, centro, contenidoYo(), { z: 400, dato: 'punto' }).addTo(grupo);
      // Los límites salen del radio, no del círculo: el círculo aún no existe en un mapa que todavía no tiene vista
      m.fitBounds(L.latLng(centro.lat, centro.lng).toBounds(radioKm * 2000), { padding: [24, 24] });
    } else if (bordes.length > 0) {
      m.fitBounds(L.latLngBounds(bordes), { padding: [48, 48] });
    } else {
      m.setView(JULIACA, 13);
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
      <div
        ref={lienzo}
        className={clases(s.lienzo, s.lienzoLeaflet)}
        role="application"
        aria-label="Mapa con los compradores de la lista"
      />
      {!listo && (
        <div className={s.sinMapa}>
          <span className="girando" aria-hidden="true" />
        </div>
      )}
      <div className={clases(s.nota, s.notaIzquierda)}>
        <Icono nombre="i-lock" tamano="sm" />
        Tu ubicación exacta no se comparte
      </div>
    </>
  );
}
