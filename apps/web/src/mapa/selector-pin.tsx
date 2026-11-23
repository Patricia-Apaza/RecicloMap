'use client';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { BuscadorDirecciones } from './buscador-direcciones';
import { useConfiguracionPublica } from './configuracion';
import { JULIACA } from './google-maps';
import { cargarLeaflet, crearMapaBase, type Leaf, marcadorHtml, type Punto } from './leaflet';
import s from './mapa.module.css';
import { SelectorPinGoogle } from './selector-pin-google';

export type { Punto };

const redondear = (punto: Punto): Punto => ({
  lat: Math.round(punto.lat * 1e6) / 1e6,
  lng: Math.round(punto.lng * 1e6) / 1e6,
});

type Props = { valor: Punto | null; centro: Punto | null; alCambiar: (punto: Punto) => void };

// Pin del local: búsqueda con botón «Buscar», toque en el mapa o arrastre. El mapa funciona sin ninguna clave
export function SelectorPin(props: Props) {
  const { configuracion, cargando } = useConfiguracionPublica();
  if (cargando) return <span className="girando" aria-hidden="true" />;
  if (!configuracion) {
    return (
      <div className="note warn" role="status">
        <Icono nombre="i-alert" />
        <span>No pudimos cargar el mapa para colocar el pin. Revisa tu conexión e inténtalo de nuevo.</span>
      </div>
    );
  }
  if (configuracion.mapa.proveedor === 'google' && configuracion.mapa.google) return <SelectorPinGoogle {...props} />;
  return <SelectorPinLeaflet cfg={configuracion.mapa} {...props} />;
}

function SelectorPinLeaflet({
  cfg,
  valor,
  centro,
  alCambiar,
}: Props & { cfg: NonNullable<ReturnType<typeof useConfiguracionPublica>['configuracion']>['mapa'] }) {
  const lienzo = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const marcador = useRef<Leaflet.Marker | null>(null);
  const leaf = useRef<Leaf | null>(null);
  const alCambiarActual = useRef(alCambiar);
  const [error, setError] = useState(false);

  useEffect(() => {
    alCambiarActual.current = alCambiar;
  }, [alCambiar]);

  const colocar = (punto: Punto, acercar = false) => {
    const L = leaf.current;
    const m = mapa.current;
    if (!L || !m) return;
    if (marcador.current) marcador.current.setLatLng(punto);
    else {
      const pin = document.createElement('span');
      pin.className = s.pinPunto ?? '';
      const nuevo = marcadorHtml(L, punto, pin, {
        titulo: 'Tu local: arrastra para corregir',
        arrastrable: true,
        centrado: true,
      }).addTo(m);
      nuevo.on('dragend', () => alCambiarActual.current(redondear(nuevo.getLatLng())));
      marcador.current = nuevo;
    }
    if (acercar) m.setView(punto, 17);
    alCambiarActual.current(redondear(punto));
  };
  const colocarActual = useRef(colocar);
  useEffect(() => {
    colocarActual.current = colocar;
  });

  useEffect(() => {
    let vigente = true;
    void cargarLeaflet()
      .then((L) => {
        if (!vigente || !lienzo.current || mapa.current) return;
        leaf.current = L;
        const inicio = valor ?? centro ?? JULIACA;
        const m = crearMapaBase(L, lienzo.current, cfg, {
          centro: inicio,
          zoom: valor ? 17 : 15,
          alFallar: () => vigente && setError(true),
        });
        mapa.current = m;
        m.on('click', (evento: Leaflet.LeafletMouseEvent) => colocarActual.current(evento.latlng));
        if (valor) colocarActual.current(valor);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
      mapa.current?.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // El mapa se crea una vez; el centro inicial no lo mueve después
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.proveedor, cfg.teselas?.url]);

  // Si cambia la zona elegida y aún no hay pin, el mapa se centra en ella
  useEffect(() => {
    if (!valor && centro && mapa.current) mapa.current.setView(centro, 15);
  }, [centro, valor]);

  if (error) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <BuscadorDirecciones alElegir={(punto) => colocarActual.current(punto, true)} />
        <div className="note warn" role="status">
          <Icono nombre="i-alert" />
          <span>No pudimos cargar el mapa. Revisa tu conexión e inténtalo de nuevo.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <BuscadorDirecciones alElegir={(punto) => colocarActual.current(punto, true)} />
      <div
        ref={lienzo}
        style={{
          height: 320,
          borderRadius: 18,
          border: '2px solid var(--ink)',
          boxShadow: '4px 4px 0 var(--ink)',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 0,
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
