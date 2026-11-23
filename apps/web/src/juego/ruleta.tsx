'use client';

import { formatearHace } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useEffect, useRef, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { BarraProgreso, EncabezadoPagina, EstadoVacio, Nota } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { kg } from './piezas';
import type { PremioRuleta, RespuestaRuleta, ResultadoGiro } from './tipos';
import { useDatos } from './usar-datos';

// Colores de los segmentos del prototipo (pantalla 34); "Sigue intentando" siempre es el beige
const PALETA = ['#B7E36B', '#CFE3F2', '#F4E4BE', '#D9F0C9', '#EFE8D6', '#E5DAF2', '#CFE3F2', '#F4E4BE'];
const COLOR_SIN_PREMIO = '#EFE8D6';
const colorDe = (premio: PremioRuleta, indice: number) =>
  premio.tipo === 'SIN_PREMIO' ? COLOR_SIN_PREMIO : (PALETA[indice % PALETA.length] ?? '#CFE3F2');

const DURACION_MS = 5000;
const polar = (radio: number, grados: number): [number, number] => [
  radio * Math.sin((grados * Math.PI) / 180),
  -radio * Math.cos((grados * Math.PI) / 180),
];

const textoPorcentaje = (valor: number) => `${valor.toLocaleString('es-PE', { maximumFractionDigits: 2 })} %`;
const textoNoDisponible = (motivo: PremioRuleta['motivoNoDisponible']) =>
  motivo === 'SIN_STOCK' ? 'Agotado' : 'Fuera de campaña';

// Los segmentos son del mismo tamaño; la probabilidad real de cada premio está en la lista
function Rueda({ premios, giro, animar }: { premios: PremioRuleta[]; giro: number; animar: boolean }) {
  const paso = 360 / premios.length;
  return (
    <svg
      viewBox="-200 -200 400 400"
      data-rueda
      style={{
        width: '100%',
        height: '100%',
        transform: `rotate(${giro}deg)`,
        transition: animar ? `transform ${DURACION_MS}ms cubic-bezier(.12,.7,.1,1)` : 'none',
        filter: 'drop-shadow(8px 8px 0 #12301F)',
      }}
      role="img"
      aria-label="Ruleta de premios"
    >
      {premios.map((premio, i) => {
        const [x0, y0] = polar(190, i * paso - paso / 2);
        const [x1, y1] = polar(190, i * paso + paso / 2);
        const [tx, ty] = polar(125, i * paso);
        const angulo = i * paso;
        const palabras = premio.nombre.length > 12 ? premio.nombre.split(' ') : [premio.nombre];
        const primera = palabras.length > 1 ? (palabras[0] ?? '') : premio.nombre;
        const resto = palabras.length > 1 ? palabras.slice(1).join(' ') : '';
        return (
          <g key={premio.id} opacity={premio.disponible ? 1 : 0.45}>
            <path
              d={`M0 0L${x0} ${y0}A190 190 0 0 1 ${x1} ${y1}Z`}
              fill={colorDe(premio, i)}
              stroke="#12301F"
              strokeWidth="3"
            />
            <g transform={`translate(${tx} ${ty}) rotate(${angulo + (angulo > 90 && angulo < 270 ? 180 : 0)})`}>
              <text
                textAnchor="middle"
                fontFamily="Bricolage Grotesque,sans-serif"
                fontWeight="800"
                fontSize="15"
                fill="#12301F"
              >
                <tspan x="0" dy="0">
                  {primera}
                </tspan>
                {resto && (
                  <tspan x="0" dy="17">
                    {resto}
                  </tspan>
                )}
              </text>
              {premio.patrocinado && (
                <text
                  y="38"
                  textAnchor="middle"
                  fontFamily="IBM Plex Mono,monospace"
                  fontSize="9"
                  fill="#12301F"
                  fillOpacity=".6"
                >
                  PATROCINADO
                </text>
              )}
            </g>
          </g>
        );
      })}
      <circle r="188" fill="none" stroke="#12301F" strokeWidth="6" />
      <circle r="52" fill="#FFFDF7" stroke="#12301F" strokeWidth="3" />
    </svg>
  );
}

function ResultadoDelGiro({ resultado, alCerrar }: { resultado: ResultadoGiro | null; alCerrar: () => void }) {
  if (!resultado) return null;
  const sinPremio = resultado.premio.tipo === 'SIN_PREMIO';
  const detalle = sinPremio
    ? 'Esta vez no hubo premio. Tu próximo giro llega con tus kilos.'
    : resultado.premio.tipo === 'PUNTOS'
      ? `Se sumaron ${resultado.premio.puntos} puntos de bono a tu cuenta.`
      : 'Reclámalo en Mis premios con tu código antes de que venza el plazo.';
  return (
    <Ventana
      abierta
      alCerrar={alCerrar}
      antetitulo={sinPremio ? 'CASI' : 'GANASTE'}
      titulo={sinPremio ? 'Sigue intentando' : resultado.premio.nombre}
    >
      <p data-resultado>{detalle}</p>
      {resultado.premio.patrocinado && <span className="pill grey">Patrocinado</span>}
      <div className="row g8 wr">
        {resultado.premioGanado && (
          <Link className="btn p" href={RUTAS.misPremios}>
            Ir a Mis premios
          </Link>
        )}
        <button type="button" className={resultado.premioGanado ? 'btn' : 'btn p'} onClick={alCerrar}>
          Genial
        </button>
      </div>
    </Ventana>
  );
}

function Contenido() {
  const aviso = useAviso();
  const [version, setVersion] = useState(0);
  const { datos, fallo } = useDatos<RespuestaRuleta>('/yo/ruleta', version);
  const [giro, setGiro] = useState(0);
  const [girando, setGirando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoGiro | null>(null);
  // La misma clave se reutiliza si la conexión falla: así un reintento no gasta otro giro
  const clave = useRef<string>(crypto.randomUUID());
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar la ruleta" descripcion="Intenta de nuevo en un momento." />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }

  const sinMovimiento = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const giros = datos.giros.disponibles;

  const girar = async () => {
    if (girando || giros < 1 || !datos.puedeGirar) return;
    setGirando(true);
    try {
      // El servidor decide el resultado antes de que la rueda se mueva
      const respuesta = await pedir<ResultadoGiro>('/yo/ruleta/girar', { cuerpo: { clave: clave.current } });
      clave.current = crypto.randomUUID();
      const indice = Math.max(
        0,
        datos.premios.findIndex((p) => p.id === respuesta.premio.id),
      );
      const paso = 360 / datos.premios.length;
      setGiro((actual) => actual + 360 * 5 + ((((360 - indice * paso - (actual % 360)) % 360) + 360) % 360));
      const mostrar = () => {
        setResultado(respuesta);
        setGirando(false);
        setVersion((v) => v + 1);
      };
      if (sinMovimiento) mostrar();
      else temporizador.current = setTimeout(mostrar, DURACION_MS + 200);
    } catch (causa) {
      if (!(causa instanceof ErrorApi && causa.codigo === 'SIN_CONEXION')) clave.current = crypto.randomUUID();
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos girar la ruleta.');
      setGirando(false);
      setVersion((v) => v + 1);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Ruleta de premios"
        titulo="Gira y"
        resaltado="gana"
        descripcion="Cada 500 puntos de reciclaje ganas un giro. Los puntos de bono no cuentan para ganar giros. Los premios no son dinero ni se cambian por dinero."
        acciones={
          <span className="chip-pts" style={{ height: 46, fontSize: 15 }} data-giros={giros}>
            <Icono nombre="i-gift" />
            {giros} {giros === 1 ? 'giro disponible' : 'giros disponibles'}
          </span>
        }
      />
      {datos.enPausa && (
        <Nota tono="atencion">
          <b>Ruleta en pausa.</b> Conservas tus giros y puedes reclamar los premios que ya ganaste.
        </Nota>
      )}
      {!datos.puedeGirar && !datos.enPausa && (
        <Nota tono="atencion">Verifica tu teléfono para poder girar la ruleta.</Nota>
      )}
      <div className="cols" style={{ alignItems: 'start' }}>
        <section
          className="panel"
          style={{ display: 'grid', placeItems: 'center', padding: '40px 20px', overflow: 'hidden' }}
        >
          <div style={{ position: 'relative', width: 'min(460px,80vw)', aspectRatio: '1' }}>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '50%',
                top: -14,
                transform: 'translateX(-50%)',
                zIndex: 3,
                width: 0,
                height: 0,
                borderLeft: '16px solid transparent',
                borderRight: '16px solid transparent',
                borderTop: '36px solid var(--ink)',
                filter: 'drop-shadow(0 3px 0 var(--lime))',
              }}
            />
            <Rueda premios={datos.premios} giro={giro} animar={!sinMovimiento} />
            <button
              type="button"
              className="btn p"
              data-girar
              disabled={girando || giros < 1 || !datos.puedeGirar}
              onClick={() => void girar()}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%,-50%)',
                width: 92,
                height: 92,
                borderRadius: '50%',
                fontSize: 17,
                zIndex: 2,
              }}
            >
              GIRAR
            </button>
          </div>
          <p className="mini" style={{ marginTop: 20, textAlign: 'center' }}>
            {giros < 1
              ? `Tu próximo giro llega en ${datos.giros.faltan} puntos de reciclaje.`
              : 'El resultado lo decide el servidor al tocar GIRAR.'}
          </p>
          <p className="mini" style={{ marginTop: 8, textAlign: 'center' }} data-aviso-segmentos>
            El tamaño de los segmentos no refleja la probabilidad: mira el porcentaje real de cada premio en la lista.
          </p>
        </section>
        <aside className="stack">
          <div className="panel" data-panel="avance">
            <h3>Tu próximo giro</h3>
            <div className="row sp" style={{ margin: '8px 0 6px', fontSize: 13 }}>
              <span>
                {datos.giros.avance} de {datos.giros.puntosPorGiro} puntos
              </span>
              <span className="mono">faltan {datos.giros.faltan}</span>
            </div>
            <BarraProgreso
              valor={datos.giros.avance}
              maximo={datos.giros.puntosPorGiro}
              etiqueta="Avance al próximo giro"
            />
            {datos.metaMes && (
              <div style={{ marginTop: 16 }} data-meta-mes>
                <div className="row sp wr">
                  <b style={{ font: '700 15px var(--head)' }}>Meta del mes</b>
                  <span className={datos.metaMes.estado === 'EN_PROGRESO' ? 'pill blue' : 'pill open'}>
                    {datos.metaMes.estado === 'EN_PROGRESO' ? (
                      `+${datos.metaMes.puntosBono} puntos y 1 giro`
                    ) : (
                      <>
                        <i />
                        {datos.metaMes.estado === 'RECLAMADO' ? 'Reclamada' : 'Lista para reclamar'}
                      </>
                    )}
                  </span>
                </div>
                <div className="row g16" style={{ marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <BarraProgreso valor={datos.metaMes.kg} maximo={datos.metaMes.metaKg} etiqueta="Meta del mes" />
                  </div>
                  <span className="mono" style={{ font: '600 13px var(--mono)' }}>
                    {kg(datos.metaMes.kg)}/{kg(datos.metaMes.metaKg)} kg
                  </span>
                </div>
                {datos.metaMes.estado === 'COMPLETADO' && (
                  <Link className="btn sm" href={RUTAS.desafios} style={{ marginTop: 10 }}>
                    Reclamar en Desafíos
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="panel" data-panel="premios-posibles">
            <h3>Premios de esta ruleta</h3>
            <p className="mini" style={{ margin: '4px 0 10px' }}>
              Esta es la probabilidad real de cada premio. Si uno se agota o termina su campaña, su probabilidad pasa a
              «Sigue intentando».
            </p>
            <div className="list" style={{ gap: 8 }}>
              {datos.premios.map((p, i) => (
                <div
                  key={p.id}
                  data-premio={p.nombre}
                  className="row g16"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '1.5px solid var(--line)',
                    opacity: p.disponible ? 1 : 0.6,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: colorDe(p, i),
                      border: '2px solid var(--ink)',
                      flex: 'none',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ font: '600 14px var(--head)' }}>{p.nombre}</b>
                    {p.tipo === 'OBJETO' && (
                      <div className="mini">
                        Se recoge en {p.puntoEntrega ?? 'el punto de entrega'} · {p.vigenciaCanjeDias ?? 30} días para
                        reclamar
                      </div>
                    )}
                    {p.tipo === 'PUNTOS' && <div className="mini">Puntos de bono: no dan giros</div>}
                  </div>
                  {p.patrocinado && <span className="pill grey">Patrocinado</span>}
                  {!p.disponible && <span className="pill closed">{textoNoDisponible(p.motivoNoDisponible)}</span>}
                  <span className="mono mini" data-probabilidad>
                    {textoPorcentaje(p.probabilidad)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel" data-panel="historial-premios">
            <h3>Mis premios</h3>
            {datos.ultimos.length === 0 ? (
              <p className="mini">
                Aún no has girado. Tu próximo giro llega a los {datos.giros.puntosPorGiro} puntos de reciclaje.
              </p>
            ) : (
              datos.ultimos.map((u) => (
                <div
                  key={u.id}
                  className="row sp"
                  style={{ padding: '7px 0', borderBottom: '1.5px solid var(--line)', fontSize: 14 }}
                >
                  <b>{u.nombre}</b>
                  <span className="mini">{formatearHace(u.fecha)}</span>
                </div>
              ))
            )}
            <Link className="btn sm" href={RUTAS.misPremios} style={{ marginTop: 12 }}>
              Ver mis premios
            </Link>
          </div>
        </aside>
      </div>
      <ResultadoDelGiro resultado={resultado} alCerrar={() => setResultado(null)} />
    </>
  );
}

export function Ruleta() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
