'use client';

import { CODIGOS_MATERIAL, type CodigoMaterial, type ModoRuta } from '@reciclomap/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { MapaPunto } from '@/mapa/mapa-punto';
import { PedirUbicacion } from '@/mapa/pedir-ubicacion';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Destino = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  direccion: string | null;
  zona: string | null;
  posicion: { lat: number; lng: number };
  enlace: string;
  rutaDisponible: boolean;
};
type Ruta = { distanciaKm: number; minutos: number; trazo: string | null; pasos: string[] };
const MODOS: Array<[ModoRuta, string]> = [
  ['pie', 'A pie'],
  ['moto', 'Moto'],
  ['transporte', 'Transporte'],
];
const duracion = (minutos: number) =>
  minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;

// Pantalla 21 (RN-17): solo suma al conteo del negocio, que no recibe aviso ni sabe quién fue
function Contenido() {
  const parametros = useSearchParams();
  const negocioId = parametros.get('negocio') ?? '';
  const material = parametros.get('material');
  const { configuracion } = useConfiguracionPublica();
  const { ubicacion } = useUbicacion();
  const cabeceras = useMemo(() => cabecerasDeUbicacion(ubicacion), [ubicacion]);
  const [destino, setDestino] = useState<Destino | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoRuta>('pie');
  const [ruta, setRuta] = useState<{ ruta: Ruta | null; clave: string } | null>(null);
  const pedida = useRef(false);

  useEffect(() => {
    if (!negocioId || pedida.current) return;
    pedida.current = true;
    const cuerpo = CODIGOS_MATERIAL.includes(material as CodigoMaterial) ? { material } : {};
    pedir<Destino>(`/compradores/${negocioId}/solicitudes-llegada`, { cuerpo })
      .then((respuesta) => {
        setDestino(respuesta);
        document.title = `Cómo llegar a ${respuesta.nombre} · RecicloMap`;
      })
      .catch((causa: unknown) => setError(causa instanceof ErrorApi ? causa.message : 'No encontramos ese negocio.'));
  }, [negocioId, material]);

  const clave = destino?.rutaDisponible && ubicacion ? `${modo}|${JSON.stringify(cabeceras)}` : '';
  useEffect(() => {
    if (!clave || !destino) return;
    let vigente = true;
    pedir<{ ruta: Ruta | null }>(`/compradores/${destino.id}/ruta?modo=${modo}`, { cabeceras })
      .then((respuesta) => vigente && setRuta({ ruta: respuesta.ruta, clave }))
      .catch(() => vigente && setRuta({ ruta: null, clave }));
    return () => {
      vigente = false;
    };
  }, [clave, destino, modo, cabeceras]);

  if (!negocioId || error) {
    return (
      <div className="empty">
        <b>{error ?? 'Elige un negocio en el mapa para ver cómo llegar.'}</b>
        <Link className="btn p sm" href={RUTAS.mapa}>
          Ir al mapa
        </Link>
      </div>
    );
  }
  if (!destino) return <span className="girando" aria-label="Cargando" />;
  const actual = ruta?.clave === clave ? ruta.ruta : null;
  const claveMapa = configuracion?.googleMaps?.clave;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Cómo llegar"
        titulo="Cómo llegar a"
        resaltado={destino.nombre}
        descripcion="Calculamos la ruta desde tu ubicación aproximada (redondeada a unos 100 m). No la guardamos ni se la mostramos al negocio."
        acciones={
          <Link className="btn ghost" href={`/negocios/${destino.id}`}>
            <Icono nombre="i-arrow-left" />
            Volver
          </Link>
        }
      />
      <div className="cols">
        <section className="panel" style={{ padding: 0, overflow: 'hidden', minHeight: 320, position: 'relative' }}>
          {claveMapa ? (
            <div style={{ height: '100%', minHeight: 320 }}>
              <MapaPunto
                clave={claveMapa}
                idMapa={configuracion?.googleMaps?.idMapa ?? 'DEMO_MAP_ID'}
                punto={destino.posicion}
                etiqueta={destino.nombre}
              />
            </div>
          ) : (
            <div className="empty" style={{ border: 0, minHeight: 320 }}>
              <Icono nombre="i-map" tamano="lg" />
              <b>El mapa no está disponible</b>
              <span className="mini">Abre la ruta en Google Maps desde tu teléfono.</span>
            </div>
          )}
        </section>
        <aside className="stack">
          <div className="panel" data-destino>
            <div className="row g16">
              <span
                className={destino.tipo === 'CENTRO' ? 'ico' : 'ico s'}
                style={{ width: 52, height: 52 }}
                aria-hidden="true"
              >
                <Icono nombre={destino.tipo === 'CENTRO' ? 'i-store' : 'i-truck'} />
              </span>
              <div>
                <b style={{ font: '800 18px var(--head)' }}>{destino.nombre}</b>
                <div className="mini">
                  {destino.tipo === 'CENTRO' ? destino.direccion : `Zona: ${destino.zona ?? 'no indicada'}`}
                </div>
              </div>
            </div>
            {destino.tipo === 'MOVIL' && (
              <div className="note" style={{ marginTop: 12 }}>
                <Icono nombre="i-info" />
                <span>Los compradores móviles se mueven. Escríbele por WhatsApp para confirmar dónde encontrarlo.</span>
              </div>
            )}
            <a
              className="btn p"
              href={destino.enlace}
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: '100%', marginTop: 14 }}
            >
              <Icono nombre="i-nav" />
              Abrir en Google Maps
            </a>
            <p className="mini" style={{ margin: '8px 0 0' }}>
              Google Maps recibe solo el destino; la ruta la calcula tu teléfono.
            </p>
          </div>
          {destino.rutaDisponible && (
            <>
              {!ubicacion ? (
                <PedirUbicacion compacto />
              ) : (
                <>
                  <div className="panel">
                    <h3>¿Cómo vas?</h3>
                    <div
                      className="seg"
                      role="group"
                      aria-label="Cómo vas"
                      style={{ width: '100%', gridAutoColumns: '1fr' }}
                    >
                      {MODOS.map(([valor, texto]) => (
                        <button key={valor} type="button" aria-pressed={modo === valor} onClick={() => setModo(valor)}>
                          {texto}
                        </button>
                      ))}
                    </div>
                    {actual ? (
                      <div className="row sp" style={{ marginTop: 14 }} data-ruta>
                        <div>
                          <div className="mini">Tiempo estimado</div>
                          <div style={{ font: '800 30px var(--head)' }}>{duracion(actual.minutos)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mini">Distancia</div>
                          <div style={{ font: '800 30px var(--head)' }}>{actual.distanciaKm.toFixed(1)} km</div>
                        </div>
                      </div>
                    ) : ruta?.clave === clave ? (
                      <p className="mini" style={{ marginTop: 12 }}>
                        No pudimos calcular la ruta en este modo. Usa «Abrir en Google Maps».
                      </p>
                    ) : (
                      <span className="girando" aria-label="Calculando la ruta" />
                    )}
                  </div>
                  {actual && actual.pasos.length > 0 && (
                    <div className="panel">
                      <h3>Pasos</h3>
                      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {actual.pasos.map((paso, indice) => (
                          <li key={indice}>{paso}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

export function ComoLlegar() {
  return (
    <Protegida invitado roles={['RECICLADOR']}>
      <MarcoApp activa="mapa">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
