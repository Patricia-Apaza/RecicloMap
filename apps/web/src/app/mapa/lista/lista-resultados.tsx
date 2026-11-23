'use client';

import { CODIGOS_MATERIAL, NOMBRE_MATERIAL, ORDENES_MAPA, type OrdenMapa } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { clases } from '@/diseno/clases';
import { EtiquetaDemanda, EtiquetaSemaforo, EtiquetaDestacadoPro } from '@/diseno/etiquetas';
import { Icono } from '@/diseno/icono';
import { useFiltrosMapa } from '@/mapa/filtros';
import { PedirUbicacion, TextoUbicacion } from '@/mapa/pedir-ubicacion';
import { Calificacion, EstadoNegocio, iconoNegocio, tipoNegocio } from '@/mapa/piezas';
import { hace, RUTA_DETALLE, TEXTO_PAGO, useResultados } from '@/mapa/resultados';
import { useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { Protegida } from '@/sesion/protegida';
import { TEXTO_ORDEN } from '../mapa-compradores';

const TEXTO_TIPO = { todos: '', centro: 'Centros', movil: 'Móviles' } as const;

function Contenido() {
  const { filtros, cambiar } = useFiltrosMapa();
  const { ubicacion } = useUbicacion();
  const resultados = useResultados(filtros, ubicacion);
  const datos = resultados.datos;

  const chips = [
    NOMBRE_MATERIAL[filtros.material],
    TEXTO_TIPO[filtros.tipo],
    filtros.soloAbiertos ? 'Abierto ahora' : '',
    `Hasta ${filtros.radio} km`,
    ...filtros.pagos.map((pago) => TEXTO_PAGO[pago] ?? pago),
    filtros.soloAlDia ? 'Precio al día' : '',
    filtros.demandaMinima ? (filtros.demandaMinima === 'ALTA' ? 'Demanda alta' : 'Demanda media o más') : '',
  ].filter(Boolean);

  return (
    <MarcoApp activa="mapa">
      <div className="ph">
        <div>
          <span className="kick">Descubrir</span>
          <h1>
            Quién compra <u>cerca de ti</u>
          </h1>
          <p>La misma búsqueda del mapa, en lista. Distancias aproximadas; la ubicación exacta de nadie se muestra.</p>
        </div>
        <div className="row g8 wr">
          <Link className="btn" href={RUTAS.filtros}>
            <Icono nombre="i-search" />
            Filtros
          </Link>
          <Link className="btn p" href={RUTAS.mapa}>
            <Icono nombre="i-map" />
            Ver en el mapa
          </Link>
        </div>
      </div>
      {!ubicacion ? (
        <div style={{ maxWidth: 520 }}>
          <PedirUbicacion />
        </div>
      ) : (
        <>
          <div className="row sp wr" style={{ marginBottom: 18, gap: 12 }}>
            <div className="row g8 wr">
              {chips.map((chip) => (
                <span key={chip} className="cp" style={{ background: 'var(--mint)', cursor: 'default' }}>
                  {chip}
                </span>
              ))}
              <Link
                className="mini"
                href={RUTAS.filtros}
                style={{ color: 'var(--deep)', fontWeight: 700, marginLeft: 6 }}
              >
                Cambiar
              </Link>
            </div>
            <div className="row g8">
              <label className="mini" htmlFor="orden-lista">
                Ordenar
              </label>
              <div className="inp" style={{ height: 42, width: 240 }}>
                <select
                  id="orden-lista"
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
            </div>
          </div>
          <div className="cols">
            <section className="stack">
              <div className="row sp wr mini" aria-live="polite">
                <TextoUbicacion />
                {datos && datos.comparadoEntre > 1 && <span>Semáforo entre {datos.comparadoEntre} opciones</span>}
              </div>
              <div className="list" style={{ gap: 16 }}>
                {resultados.error && <div className="note warn">{resultados.error}</div>}
                {datos && datos.opciones.length === 0 && (
                  <div className="empty">
                    <b>Sin resultados</b>
                    <span className="mini">Prueba ampliando el radio o quitando algún filtro.</span>
                    <Link className="btn p sm" href={RUTAS.filtros}>
                      Cambiar filtros
                    </Link>
                  </div>
                )}
                {!datos && !resultados.error && <span className="girando" aria-hidden="true" />}
                {datos?.opciones.map((opcion) => (
                  <article
                    key={opcion.id}
                    className="panel"
                    style={{
                      padding: '18px 20px',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0,1fr) auto',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div className="row g16" style={{ marginBottom: 8 }}>
                        <span
                          className={clases('ico', opcion.tipo === 'MOVIL' && 's')}
                          style={{ width: 48, height: 48 }}
                        >
                          <Icono nombre={iconoNegocio(opcion)} />
                        </span>
                        <div>
                          <b style={{ font: '800 19px var(--head)', color: 'var(--ink)' }}>{opcion.nombre}</b>{' '}
                          {opcion.esPro && <EtiquetaDestacadoPro />}
                          <div className="mini">
                            {tipoNegocio(opcion)} · ~{Math.max(1, Math.round(opcion.distanciaKm))} km
                            {opcion.zona ? ` · ${opcion.zona}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="row g8 wr">
                        <EstadoNegocio estado={opcion.estado} />
                        <Calificacion calificacion={opcion.calificacion} />
                        <span className="mini">
                          {opcion.pagos.length > 0
                            ? opcion.pagos.map((pago) => TEXTO_PAGO[pago] ?? pago).join(' · ')
                            : 'Pagos: No indicado'}
                        </span>
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono" style={{ fontWeight: 700, color: 'var(--ink)', padding: '4px 0' }}>
                        {datos.material.nombre} S/ {opcion.precio.min}–{opcion.precio.max}
                      </div>
                      <div className="row wr g8" style={{ marginBottom: 6 }}>
                        <EtiquetaSemaforo semaforo={opcion.semaforo.clave} />
                        <EtiquetaDemanda demanda={opcion.demanda} />
                      </div>
                      {opcion.precio.antiguo && (
                        <div className="mini" style={{ color: 'var(--warn)', marginBottom: 6 }}>
                          Precio antiguo · {hace(opcion.precio.actualizadoEn)}
                        </div>
                      )}
                      <Link className="btn p sm" href={RUTA_DETALLE(opcion.id)} style={{ width: '100%' }}>
                        Ver detalle
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <aside className="stack">
              <div className="panel">
                <h3>Material para comparar</h3>
                <div
                  className="mt"
                  style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
                  role="group"
                  aria-label="Material"
                >
                  {CODIGOS_MATERIAL.map((codigo) => (
                    <button
                      key={codigo}
                      type="button"
                      aria-pressed={filtros.material === codigo}
                      onClick={() => cambiar({ material: codigo })}
                    >
                      <Icono nombre={ICONO_MATERIAL[codigo]} />
                      {NOMBRE_MATERIAL[codigo]}
                    </button>
                  ))}
                </div>
                <p className="mini" style={{ marginTop: 12 }}>
                  El semáforo compara solo el material elegido entre los resultados visibles.
                </p>
              </div>
              <div className="note">
                <Icono nombre="i-info" />
                <span>
                  <b>Recomendado</b> pone primero a quienes tienen plan Pro y luego ordena por cercanía. Pro no cambia
                  precios ni el semáforo.
                </span>
              </div>
            </aside>
          </div>
        </>
      )}
    </MarcoApp>
  );
}

export function ListaResultados() {
  return (
    <Protegida invitado pasos={['LISTO', 'ESPERAR_VERIFICACION']}>
      <Contenido />
    </Protegida>
  );
}
