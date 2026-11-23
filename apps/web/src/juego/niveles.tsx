'use client';

import Link from '@/diseno/enlace';
import { BarraProgreso, EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { Protegida } from '@/sesion/protegida';
import { COLOR_NIVEL, IconoNivel, kg } from './piezas';
import type { RespuestaNiveles } from './tipos';
import { useDatos } from './usar-datos';

// Pantalla 31: los niveles salen solo de los kilos reales, nunca de los puntos de bonus
function Contenido() {
  const { datos, fallo } = useDatos<RespuestaNiveles>('/yo/niveles');
  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar tus niveles" />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const actual = datos.niveles.find((n) => n.numero === datos.nivel.numero)!;
  const maximo = Math.max(...datos.semanas.map((s) => s.kg), 1);
  return (
    <>
      <EncabezadoPagina
        antetitulo="Puntos y niveles"
        titulo="Tus"
        resaltado="niveles"
        descripcion="Subes de nivel por kilos reciclados. Los niveles dan insignias y reconocimiento, nunca mejores precios."
        acciones={
          <Link className="btn" href={RUTAS.insignias}>
            Ver insignias
          </Link>
        }
      />
      <div className="cols">
        <section className="stack">
          <div className="panel" data-panel="nivel-actual">
            <div className="row g16 wr">
              <span
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 26,
                  background: COLOR_NIVEL[datos.nivel.numero - 1],
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icono nombre="i-leaf" tamano="lg" />
              </span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <span className="kick">Nivel {datos.nivel.numero} de 6</span>
                <div style={{ font: '800 40px/1 var(--head)', letterSpacing: '-.04em', margin: '6px 0' }}>
                  {datos.nivel.nombre}
                </div>
                {datos.siguiente ? (
                  <>
                    <div className="row sp mini" style={{ margin: '12px 0 6px' }}>
                      <span>
                        Hacia <b>{datos.siguiente.nombre}</b>
                      </span>
                      <b className="mono">
                        {kg(datos.kgTotal)} / {kg(datos.siguiente.kgMin)} kg
                      </b>
                    </div>
                    <BarraProgreso
                      valor={datos.kgTotal - actual.kgMin}
                      maximo={datos.siguiente.kgMin - actual.kgMin}
                      etiqueta={`Progreso hacia ${datos.siguiente.nombre}`}
                    />
                    <p className="mini" style={{ marginTop: 8 }}>
                      Te faltan <b>{kg(datos.siguiente.faltan)} kg</b> para subir.
                    </p>
                  </>
                ) : (
                  <p>Alcanzaste el nivel máximo. ¡Gracias por reciclar!</p>
                )}
              </div>
            </div>
          </div>
          <div className="panel" data-panel="escalera">
            <h2>Escalera de niveles</h2>
            <div className="list" style={{ gap: 12 }}>
              {[...datos.niveles].reverse().map((n) => {
                const logrado = datos.kgTotal >= n.kgMin;
                const esActual = n.numero === datos.nivel.numero;
                return (
                  <div
                    key={n.numero}
                    data-nivel={n.numero}
                    className="row g16"
                    style={{
                      border: '2px solid var(--ink)',
                      borderRadius: 16,
                      padding: '12px 14px',
                      opacity: logrado ? 1 : 0.55,
                      ...(esActual ? { background: '#F3FAE6', boxShadow: '4px 4px 0 var(--g)' } : {}),
                    }}
                  >
                    <IconoNivel lograda={logrado} color={COLOR_NIVEL[n.numero - 1]!} />
                    <div style={{ flex: 1 }}>
                      <b style={{ font: '800 17px var(--head)' }}>
                        {n.numero}. {n.nombre}
                      </b>
                      <div className="mini">{n.kgMin.toLocaleString('es-PE')} kg acumulados</div>
                    </div>
                    {esActual ? (
                      <span className="pill open">
                        <i />
                        Estás aquí
                      </span>
                    ) : logrado ? (
                      <span className="pill grey">Superado</span>
                    ) : (
                      <span className="mono mini">{kg(n.kgMin - datos.kgTotal)} kg más</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <aside className="stack">
          <div className="panel" data-panel="semanas">
            <h3>
              Kg por semana <small style={{ font: '500 12px var(--body)', color: 'var(--muted)' }}>últimas 8</small>
            </h3>
            <svg
              viewBox="0 0 380 200"
              role="img"
              aria-label={`Kilos por semana: ${datos.semanas.map((s) => kg(s.kg)).join(', ')}`}
              style={{ width: '100%' }}
            >
              {datos.semanas.map((s, i) => {
                const x = 20 + i * 46;
                const alto = (s.kg / maximo) * 140;
                return (
                  <g key={s.lunes}>
                    <rect
                      x={x}
                      y={170 - alto}
                      width={32}
                      height={alto}
                      rx={7}
                      fill={i === 7 ? '#B7E36B' : '#CFE3F2'}
                      stroke="#12301F"
                      strokeWidth={2}
                    />
                    <text
                      x={x + 16}
                      y={162 - alto}
                      textAnchor="middle"
                      fontFamily="IBM Plex Mono"
                      fontSize={10}
                      fontWeight={600}
                      fill="#12301F"
                    >
                      {s.kg > 0 ? kg(s.kg) : ''}
                    </text>
                    <text x={x + 16} y={190} textAnchor="middle" fontFamily="Inter" fontSize={10} fill="#5E6E65">
                      S{i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="mini">Operaciones completadas y entregas directas confirmadas.</p>
          </div>
          <div className="panel">
            <h3>Cómo sumar más</h3>
            <div className="list" style={{ gap: 10 }}>
              <div className="row g16">
                <span className="mi" style={{ background: 'var(--lime)' }}>
                  <Icono nombre="i-recycle" />
                </span>
                <span>
                  Completa operaciones: <b>1 punto por kg</b>.
                </span>
              </div>
              <div className="row g16">
                <span className="mi" style={{ background: 'var(--sand)' }}>
                  <Icono nombre="i-trophy" />
                </span>
                <span>
                  Cumple{' '}
                  <Link href={RUTAS.desafios} style={{ color: 'var(--deep)', fontWeight: 700 }}>
                    desafíos
                  </Link>{' '}
                  mensuales.
                </span>
              </div>
              <div className="row g16">
                <span className="mi" style={{ background: 'var(--sky)' }}>
                  <Icono nombre="i-check" />
                </span>
                <span>
                  Registra una{' '}
                  <Link href={RUTAS.entregasDirectas} style={{ color: 'var(--deep)', fontWeight: 700 }}>
                    entrega directa
                  </Link>{' '}
                  y que el negocio la confirme.
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export function NivelesReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
