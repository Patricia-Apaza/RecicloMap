'use client';

import { formatearFecha } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useState } from 'react';
import { BarraProgreso, EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Ventana } from '@/diseno/avisos';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { Protegida } from '@/sesion/protegida';
import { COLOR_INSIGNIA, Hexagono, ICONO_INSIGNIA, kg, TEXTO_CATEGORIA } from './piezas';
import type { InsigniaJuego, RespuestaInsignias } from './tipos';
import { useDatos } from './usar-datos';

// Pantalla 37: las 12 insignias; cada una se gana por un hábito y se calcula en el servidor
function Contenido() {
  const { datos, fallo } = useDatos<RespuestaInsignias>('/yo/insignias');
  const [abierta, setAbierta] = useState<InsigniaJuego | null>(null);
  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar tus insignias" />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const categorias = [...new Set(datos.datos.map((i) => i.categoria))];
  return (
    <>
      <EncabezadoPagina
        antetitulo="Puntos y niveles"
        titulo="Colección de"
        resaltado="insignias"
        descripcion="Cada una se gana por un hábito: reciclar, ser constante o ayudar a otros."
        acciones={
          <span className="pill open" style={{ height: 34, fontSize: 14 }} data-contador>
            {datos.logradas} / {datos.total} logradas
          </span>
        }
      />
      <div className="stack" id="insignias">
        {categorias.map((categoria) => (
          <section key={categoria} className="panel">
            <h2>{TEXTO_CATEGORIA[categoria]}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 16 }}>
              {datos.datos
                .filter((i) => i.categoria === categoria)
                .map((i) => (
                  <button
                    key={i.codigo}
                    type="button"
                    data-insignia={i.codigo}
                    data-lograda={i.lograda}
                    onClick={() => setAbierta(i)}
                    style={{
                      border: 0,
                      background: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <Hexagono
                      icono={ICONO_INSIGNIA[i.codigo] ?? 'i-star'}
                      color={COLOR_INSIGNIA[i.codigo] ?? '#D9F0C9'}
                      lograda={i.lograda}
                    />
                    <b style={{ font: '700 13.5px var(--head)', textAlign: 'center' }}>{i.nombre}</b>
                    {i.lograda ? (
                      <span className="pill open">
                        <i />
                        Lograda
                      </span>
                    ) : (
                      <span className="mini mono">
                        {kg(i.actual)}/{kg(i.meta)}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
      <Ventana
        abierta={abierta !== null}
        alCerrar={() => setAbierta(null)}
        antetitulo="INSIGNIA"
        titulo={abierta?.nombre ?? ''}
      >
        {abierta && (
          <div className="stack" style={{ gap: 12, alignItems: 'center', textAlign: 'center' }} data-detalle-insignia>
            <Hexagono
              icono={ICONO_INSIGNIA[abierta.codigo] ?? 'i-star'}
              color={COLOR_INSIGNIA[abierta.codigo] ?? '#D9F0C9'}
              lograda={abierta.lograda}
              tamano={130}
            />
            <p>{abierta.descripcion}</p>
            {abierta.lograda ? (
              <span className="pill open">
                <i />
                Lograda{abierta.obtenidaEn ? ` el ${formatearFecha(abierta.obtenidaEn)}` : ''}
              </span>
            ) : (
              <div style={{ width: '100%' }}>
                <div className="row sp mini" style={{ marginBottom: 6 }}>
                  <span>Progreso</span>
                  <b className="mono">
                    {kg(abierta.actual)} / {kg(abierta.meta)} {abierta.unidad}
                  </b>
                </div>
                <BarraProgreso
                  valor={abierta.actual}
                  maximo={abierta.meta}
                  etiqueta={`Progreso de ${abierta.nombre}`}
                />
              </div>
            )}
            <button type="button" className="btn" onClick={() => setAbierta(null)}>
              Cerrar
            </button>
          </div>
        )}
      </Ventana>
      <p className="mini" style={{ marginTop: 16 }}>
        Tu progreso también está en{' '}
        <Link href={RUTAS.perfil} style={{ color: 'var(--deep)', fontWeight: 700 }}>
          tu perfil
        </Link>
        .
      </p>
    </>
  );
}

export function InsigniasReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
