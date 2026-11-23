'use client';

import { ORDENES_MAPA, type OrdenMapa, TIPOS_MAPA } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clases } from '@/diseno/clases';
import { EtiquetaDemanda, EtiquetaSemaforo, EtiquetaDestacadoPro } from '@/diseno/etiquetas';
import { Icono } from '@/diseno/icono';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { useFiltrosMapa } from '@/mapa/filtros';
import s from '@/mapa/mapa.module.css';
import { MapaResultados } from '@/mapa/mapa-resultados';
import { PedirUbicacion, TextoUbicacion } from '@/mapa/pedir-ubicacion';
import { Calificacion, EstadoNegocio, iconoNegocio, SelectorMaterial, SelectorRadio, tipoNegocio } from '@/mapa/piezas';
import { hace, type Opcion, RUTA_DETALLE, useResultados } from '@/mapa/resultados';
import { useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

export const TEXTO_ORDEN: Record<OrdenMapa, string> = {
  recomendado: 'Recomendado',
  precio: 'Mejor precio',
  cercania: 'Más cercano',
  demanda: 'Mayor demanda',
  calificacion: 'Mejor calificación',
};
const TEXTO_TIPO = { todos: 'Todos', centro: 'Centros', movil: 'Móviles' } as const;

function Item({ opcion, elegido, alElegir }: { opcion: Opcion; elegido: boolean; alElegir: (id: string) => void }) {
  return (
    <button
      type="button"
      className={s.item}
      aria-pressed={elegido}
      aria-label={`${opcion.nombre}, S/ ${opcion.precio.min} a ${opcion.precio.max} por kilo, ${opcion.semaforo.texto}`}
      onClick={() => alElegir(opcion.id)}
    >
      <div className={s.cabeza}>
        <span className={clases(s.icono, opcion.tipo === 'MOVIL' && s.movil)}>
          <Icono nombre={iconoNegocio(opcion)} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3>
            {opcion.nombre}
            {opcion.esPro && <EtiquetaDestacadoPro />}
          </h3>
          <div className={s.meta}>
            <span>{tipoNegocio(opcion)}</span>
            <Calificacion calificacion={opcion.calificacion} />
            <span>
              <Icono nombre="i-pin" tamano="sm" /> a {opcion.distanciaKm.toFixed(1)} km
            </span>
          </div>
        </div>
      </div>
      <div className={s.renglon}>
        <span className={s.precio}>
          S/ {opcion.precio.min}–{opcion.precio.max} <small>por kg</small>
        </span>
        <EtiquetaSemaforo semaforo={opcion.semaforo.clave} />
      </div>
      <div className={s.renglon}>
        <EtiquetaDemanda demanda={opcion.demanda} />
        <EstadoNegocio estado={opcion.estado} />
      </div>
      {opcion.precio.antiguo && (
        <span className={s.antiguo}>Precio antiguo · actualizado {hace(opcion.precio.actualizadoEn)}</span>
      )}
    </button>
  );
}

function Tarjeta({ opcion, alCerrar }: { opcion: Opcion; alCerrar: () => void }) {
  return (
    <article className={s.tarjeta} aria-live="polite">
      <button type="button" className={s.cerrar} aria-label="Cerrar" onClick={alCerrar}>
        <Icono nombre="i-close" tamano="sm" />
      </button>
      <div className={s.cabeza} style={{ paddingRight: 34 }}>
        <span className={clases(s.icono, opcion.tipo === 'MOVIL' && s.movil)}>
          <Icono nombre={iconoNegocio(opcion)} />
        </span>
        <div>
          <h3
            style={{
              font: '800 20px var(--head)',
              margin: 0,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {opcion.nombre}
            {opcion.esPro && <EtiquetaDestacadoPro />}
          </h3>
          <div className={s.meta}>
            <span>{tipoNegocio(opcion)}</span>
            <Calificacion calificacion={opcion.calificacion} />
            <span>
              a {opcion.distanciaKm.toFixed(1)} km
              {opcion.zona ? ` · ${opcion.tipo === 'CENTRO' ? opcion.zona : 'zona aprox.'}` : ''}
            </span>
          </div>
        </div>
      </div>
      <div className={s.renglon}>
        <span className={s.precio} style={{ fontSize: 22 }}>
          S/ {opcion.precio.min}–{opcion.precio.max} <small>por kg</small>
        </span>
        <EtiquetaSemaforo semaforo={opcion.semaforo.clave} />
        <EtiquetaDemanda demanda={opcion.demanda} />
        <EstadoNegocio estado={opcion.estado} />
      </div>
      <div className="row g8 wr">
        <Link className="btn p sm" href={RUTA_DETALLE(opcion.id)}>
          Ver detalle
          <Icono nombre="i-arrow-right" tamano="sm" />
        </Link>
      </div>
    </article>
  );
}

function Contenido() {
  const { usuario } = useSesion();
  const { filtros, cambiar } = useFiltrosMapa();
  const { ubicacion } = useUbicacion();
  const { configuracion, cargando: cargandoConfiguracion } = useConfiguracionPublica();
  const resultados = useResultados(filtros, ubicacion);
  const [elegido, setElegido] = useState<string | null>(null);
  const alElegir = useCallback((id: string) => setElegido(id), []);
  const datos = resultados.datos;
  // Google Maps se pide solo cuando la lista ya se pintó y el navegador está libre
  const [mapaPermitido, setMapaPermitido] = useState(false);
  const listaLista = datos !== null && datos !== undefined;
  useEffect(() => {
    if (!listaLista || mapaPermitido) return;
    const ventana = window as Window & {
      requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (ventana.requestIdleCallback) {
      const id = ventana.requestIdleCallback(() => setMapaPermitido(true), { timeout: 1500 });
      return () => ventana.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setMapaPermitido(true), 300);
    return () => window.clearTimeout(id);
  }, [listaLista, mapaPermitido]);
  const opciones = useMemo(() => datos?.opciones ?? [], [datos]);
  const seleccion = opciones.find((opcion) => opcion.id === elegido) ?? null;
  const centro = useMemo(() => {
    if (ubicacion?.modo !== 'posicion') return null;
    const [lat, lng] = ubicacion.posicion.split(',').map(Number) as [number, number];
    return { lat, lng };
  }, [ubicacion]);
  const mapaCfg = configuracion?.mapa ?? null;

  return (
    <MarcoApp activa="mapa" pantallaCompleta>
      <main className={clases(s.app, !usuario && s.conFranja)} id="main">
        <section className={s.lado} aria-label="Filtros y resultados">
          <div>
            <h1>
              Quién compra <u>cerca de ti</u>
            </h1>
            <p className={s.sub}>Compara precios por kg y demanda antes de salir a recorrer.</p>
          </div>
          {!ubicacion ? (
            <PedirUbicacion />
          ) : (
            <>
              <div className={s.filtros}>
                <div>
                  <div className={s.etiquetaFiltro}>
                    <span>Material</span>
                    <span>el semáforo se calcula por material</span>
                  </div>
                  <SelectorMaterial material={filtros.material} alCambiar={(material) => cambiar({ material })} />
                </div>
                <div>
                  <div className={s.etiquetaFiltro}>
                    <span>Radio</span>
                  </div>
                  <SelectorRadio radio={filtros.radio} alCambiar={(radio) => cambiar({ radio })} />
                </div>
                <div>
                  <div className={s.etiquetaFiltro}>
                    <span>Mostrar</span>
                  </div>
                  <div className={clases('seg', s.segmento)} role="group" aria-label="Mostrar">
                    {TIPOS_MAPA.map((tipo) => (
                      <button
                        key={tipo}
                        type="button"
                        aria-pressed={filtros.tipo === tipo}
                        onClick={() => cambiar({ tipo })}
                      >
                        {TEXTO_TIPO[tipo]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={s.etiquetaFiltro} htmlFor="orden-mapa">
                    <span>Ordenar por</span>
                  </label>
                  <select
                    id="orden-mapa"
                    className={s.selector}
                    value={filtros.orden}
                    onChange={(evento) => cambiar({ orden: evento.target.value as OrdenMapa })}
                  >
                    {ORDENES_MAPA.map((orden) => (
                      <option key={orden} value={orden}>
                        {TEXTO_ORDEN[orden]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row sp wr" style={{ gap: 8 }}>
                  <TextoUbicacion />
                  <span className="row g8" style={{ gap: 10 }}>
                    <Link className="mini" href={RUTAS.filtros} style={{ fontWeight: 700, color: 'var(--deep)' }}>
                      Más filtros
                    </Link>
                    <Link className="mini" href={RUTAS.lista} style={{ fontWeight: 700, color: 'var(--deep)' }}>
                      Ver en lista
                    </Link>
                  </span>
                </div>
              </div>
              <div className={s.resumen} aria-live="polite">
                {datos ? (
                  <>
                    <span>
                      <b>{datos.opciones.length}</b> {datos.opciones.length === 1 ? 'opción' : 'opciones'} en{' '}
                      {datos.radioKm} km para <b>{datos.material.nombre}</b>
                    </span>
                    {datos.comparadoEntre > 1 && <span>semáforo entre {datos.comparadoEntre} opciones</span>}
                  </>
                ) : (
                  <span>{resultados.error ?? 'Buscando…'}</span>
                )}
                {resultados.cargando && datos && (
                  <span className="girando" aria-hidden="true" style={{ width: 16, height: 16 }} />
                )}
              </div>
              <div className={s.lista}>
                {datos && opciones.length === 0 && (
                  <div className="empty">
                    <Icono nombre="i-search" tamano="lg" />
                    <h3 style={{ fontSize: 19, margin: 0 }}>
                      Nadie compra {datos.material.nombre} en {datos.radioKm} km
                    </h3>
                    <p style={{ fontSize: 14, margin: 0 }}>
                      {datos.radioKm < 20
                        ? 'Prueba con un radio más grande o cambia el tipo.'
                        : 'Prueba con otro material o cambia el tipo.'}
                    </p>
                    {datos.radioKm < 20 && (
                      <button
                        type="button"
                        className="btn sm p"
                        onClick={() =>
                          cambiar({ radio: ([1, 3, 5, 10, 20] as const).find((km) => km > datos.radioKm) ?? 20 })
                        }
                      >
                        Ampliar radio
                      </button>
                    )}
                  </div>
                )}
                {opciones.map((opcion) => (
                  <Item key={opcion.id} opcion={opcion} elegido={opcion.id === elegido} alElegir={alElegir} />
                ))}
              </div>
            </>
          )}
        </section>
        <section className={clases(s.columna, !mapaCfg && s.sinClave)} aria-label="Mapa">
          <div className={s.mapa} style={!mapaCfg ? { minHeight: 160 } : undefined}>
            {mapaCfg && datos && mapaPermitido ? (
              <MapaResultados
                mapa={mapaCfg}
                opciones={opciones}
                centro={centro}
                radioKm={datos.radioKm}
                elegido={elegido}
                alElegir={alElegir}
              />
            ) : (
              !cargandoConfiguracion &&
              !mapaCfg && (
                <div className={s.sinMapa}>
                  <p className="mini" style={{ maxWidth: 320 }}>
                    El mapa no está disponible por ahora. La lista muestra los mismos resultados.
                  </p>
                </div>
              )
            )}
            {mapaCfg && (
              <div className={s.leyenda}>
                <h4>Cómo leer el mapa</h4>
                <div className="row g8 wr" style={{ gap: 6 }}>
                  <EtiquetaSemaforo semaforo="MEJOR" />
                  <EtiquetaSemaforo semaforo="INTERMEDIO" corto />
                  <EtiquetaSemaforo semaforo="BAJO" />
                </div>
                <p>El color del precio compara entre las opciones que ves ahora.</p>
                <hr />
                <span className="dem d3">
                  <span className="bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Demanda: es aparte del precio
                </span>
              </div>
            )}
            {seleccion && <Tarjeta opcion={seleccion} alCerrar={() => setElegido(null)} />}
          </div>
        </section>
      </main>
    </MarcoApp>
  );
}

export function MapaCompradores() {
  return (
    <Protegida invitado pasos={['LISTO', 'ESPERAR_VERIFICACION']}>
      <Contenido />
    </Protegida>
  );
}
