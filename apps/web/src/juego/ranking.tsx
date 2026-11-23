'use client';

import { type AlcanceRanking, TEXTO_ALCANCE_RANKING } from '@reciclomap/shared';
import { useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Interruptor } from '@/diseno/formulario';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { kg } from './piezas';
import type { RespuestaRanking } from './tipos';
import { useDatos } from './usar-datos';

const COLOR_PODIO = ['#F4E4BE', '#E9E3D1', '#F6C9C0'];
const iniciales = (nombre: string) =>
  nombre
    .split(' ')
    .map((palabra) => palabra[0])
    .join('')
    .replace('.', '');

// Pantalla 36: nombre abreviado, nivel y kilos. Quien se oculta no figura y no se muestra nada más de las personas
function Contenido() {
  const aviso = useAviso();
  const [alcance, setAlcance] = useState<AlcanceRanking>('mes');
  const [version, setVersion] = useState(0);
  const { datos, fallo } = useDatos<RespuestaRanking>(`/ranking?alcance=${alcance}`, version);
  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar el ranking" />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const cambiarVisibilidad = async (visible: boolean) => {
    try {
      await pedir('/yo/preferencias', { metodo: 'PUT', cuerpo: { visibleEnRanking: visible } });
      aviso(visible ? 'Apareces en el ranking' : 'Dejaste de aparecer en el ranking');
      setVersion((v) => v + 1);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.');
    }
  };
  const podio = [datos.filas[1], datos.filas[0], datos.filas[2]].filter((f) => f !== undefined);
  return (
    <>
      <EncabezadoPagina
        antetitulo="Comunidad"
        titulo="Ranking de"
        resaltado={datos.ciudad}
        descripcion={
          alcance === 'mes'
            ? `Quienes más reciclan en ${datos.mesTexto}. Solo se muestra nombre abreviado y nivel.`
            : 'Quienes más han reciclado en total. Solo se muestra nombre abreviado y nivel.'
        }
        acciones={
          <div className="seg" role="group" aria-label="Alcance">
            {(['mes', 'acumulado'] as const).map((a) => (
              <button key={a} type="button" aria-pressed={alcance === a} onClick={() => setAlcance(a)}>
                {TEXTO_ALCANCE_RANKING[a]}
              </button>
            ))}
          </div>
        }
      />
      <div className="cols">
        <section className="stack">
          {datos.filas.length === 0 ? (
            <EstadoVacio
              icono="i-trophy"
              titulo="Aún no hay nadie en el ranking"
              descripcion="Aparecerás cuando completes una operación o una entrega directa."
            />
          ) : (
            <>
              <div className="grid3" style={{ alignItems: 'end' }} data-podio>
                {podio.map((fila) => (
                  <div
                    key={fila.posicion}
                    className="panel"
                    style={{
                      textAlign: 'center',
                      padding: `${fila.posicion === 1 ? 30 : 20}px 16px`,
                      background: COLOR_PODIO[fila.posicion - 1],
                    }}
                  >
                    <div style={{ font: '800 40px/1 var(--head)' }}>{fila.posicion}</div>
                    <b style={{ font: '800 18px var(--head)', display: 'block', margin: '6px 0' }}>{fila.nombre}</b>
                    <div className="mono" style={{ fontWeight: 700 }}>
                      {kg(fila.kg)} kg
                    </div>
                    <div className="mini">{fila.nivel}</div>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="list" style={{ gap: 0 }} data-lista-ranking>
                  {datos.filas.map((fila) => (
                    <div
                      key={fila.posicion}
                      data-fila={fila.posicion}
                      className="row g16"
                      style={{
                        padding: '12px 6px',
                        borderBottom: '1.5px solid var(--line)',
                        ...(fila.esYo ? { background: '#F3FAE6', borderRadius: 12 } : {}),
                      }}
                    >
                      <b className="mono" style={{ width: 28 }}>
                        {fila.posicion}
                      </b>
                      <span
                        className="av"
                        aria-hidden="true"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: '2px solid var(--ink)',
                          background: 'var(--sky)',
                          display: 'grid',
                          placeItems: 'center',
                          font: '800 12px var(--head)',
                        }}
                      >
                        {iniciales(fila.nombre)}
                      </span>
                      <b style={{ flex: 1, font: '700 15px var(--head)' }}>
                        {fila.nombre} {fila.esYo && <span className="pill open">Tú</span>}
                      </b>
                      <span className="pill grey">{fila.nivel}</span>
                      <span className="mono" style={{ fontWeight: 700, width: 80, textAlign: 'right' }}>
                        {kg(fila.kg)} kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
        <aside className="stack">
          <div className="panel" data-panel="posicion">
            <span className="kick">Tu posición</span>
            {datos.yo.visible && datos.yo.posicion !== null ? (
              <>
                <div style={{ font: '800 56px/1 var(--head)', margin: '8px 0' }}>#{datos.yo.posicion}</div>
                <p className="mini">
                  {datos.yo.faltan !== null && datos.yo.anterior ? (
                    <>
                      Te faltan <b>{kg(datos.yo.faltan)} kg</b> para alcanzar a {datos.yo.anterior}.
                    </>
                  ) : (
                    '¡Vas primero!'
                  )}
                </p>
              </>
            ) : datos.yo.visible ? (
              <p className="mini" style={{ marginTop: 8 }}>
                Aún no apareces: suma kilos con una operación o una entrega directa.
              </p>
            ) : (
              <p className="mini" style={{ marginTop: 8 }}>
                Estás oculto del ranking. Actívalo para ver tu posición.
              </p>
            )}
          </div>
          <div className="panel">
            <h3>Privacidad</h3>
            <Interruptor
              etiqueta="Aparecer en el ranking"
              marcado={datos.yo.visible}
              alCambiar={(valor) => void cambiarVisibilidad(valor)}
            />
            <p className="mini" style={{ marginTop: 10 }}>
              Si lo apagas, sigues sumando puntos pero no figuras en la lista. Nunca mostramos tu ubicación.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

export function RankingReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
