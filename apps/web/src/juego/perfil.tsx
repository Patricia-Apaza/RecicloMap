'use client';

import { formatearFecha, formatearSoles } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { BarraProgreso, EncabezadoPagina, EstadoVacio, Estrellas } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import type { Resena } from '@/publicaciones/tipos';
import { Protegida } from '@/sesion/protegida';
import { iniciales } from '@/sesion/rutas-sesion';
import { COLOR_INSIGNIA, COLOR_NIVEL, ICONO_INSIGNIA, IconoNivel, kg } from './piezas';
import type { RespuestaCamino } from './tipos';
import { useDatos } from './usar-datos';

// Pantalla 14: tu camino reciclador (nivel, insignias especiales e historial de lo completado)
function Contenido() {
  const { datos, fallo } = useDatos<RespuestaCamino>('/yo/camino');
  const reseñas = useDatos<{ datos: Resena[] }>('/yo/resenas');
  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar tu perfil" />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const actual = datos.niveles.find((n) => n.numero === datos.nivel.numero)!;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi perfil"
        titulo="Tu camino"
        resaltado="reciclador"
        descripcion="Niveles por kilos acumulados e insignias por buen trabajo."
        acciones={
          <Link className="btn" href={RUTAS.puntos}>
            Ver mis puntos
          </Link>
        }
      />
      <div className="cols l">
        <aside className="stack">
          <div className="panel" data-perfil>
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: '50%',
                  background: 'var(--sky)',
                  border: '3px solid var(--ink)',
                  display: 'grid',
                  placeItems: 'center',
                  font: '800 36px var(--head)',
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                {iniciales(datos.nombre)}
              </span>
              <h2 style={{ margin: 0, font: '800 28px var(--head)' }}>{datos.nombre}</h2>
              <div className="row g8 wr" style={{ justifyContent: 'center' }}>
                <span className="pill" style={{ background: 'var(--lime)', color: 'var(--ink)' }}>
                  Nivel {datos.nivel.numero} · {datos.nivel.nombre}
                </span>
                {datos.confiable && (
                  <span className="pill open">
                    <i />
                    Reciclador Confiable
                  </span>
                )}
              </div>
              <div className="mini">
                <Icono nombre="i-pin" /> {datos.ciudad} · en RecicloMap desde {formatearFecha(datos.desde)}
              </div>
            </div>
            <hr className="divl" />
            <div className="grid3" style={{ gap: 8, textAlign: 'center' }}>
              <div>
                <div style={{ font: '800 24px var(--head)', color: 'var(--ink)' }}>{kg(datos.kgTotal)}</div>
                <div className="mini">kg</div>
              </div>
              <div>
                <div style={{ font: '800 24px var(--head)', color: 'var(--ink)' }}>{datos.operaciones}</div>
                <div className="mini">operaciones</div>
              </div>
              <div>
                <div style={{ font: '800 24px var(--head)', color: 'var(--ink)' }}>
                  {datos.calificacion.nuevo ? 'Nuevo' : datos.calificacion.promedio}
                </div>
                <div className="mini">calificación</div>
              </div>
            </div>
            {datos.siguiente && (
              <div style={{ marginTop: 16 }}>
                <div className="row sp mini" style={{ marginBottom: 6 }}>
                  <span>Hacia {datos.siguiente.nombre}</span>
                  <b className="mono">
                    {kg(datos.kgTotal)}/{kg(datos.siguiente.kgMin)} kg
                  </b>
                </div>
                <BarraProgreso
                  valor={datos.kgTotal - actual.kgMin}
                  maximo={datos.siguiente.kgMin - actual.kgMin}
                  etiqueta={`Progreso hacia ${datos.siguiente.nombre}`}
                />
              </div>
            )}
          </div>
          <div className="panel">
            <h3>Lo que dicen de ti</h3>
            {(reseñas.datos?.datos ?? []).slice(0, 3).map((r) => (
              <div key={r.id} style={{ padding: '10px 0', borderTop: '1.5px solid var(--line)' }}>
                <div className="row sp">
                  <b style={{ font: '700 14px var(--head)' }}>{r.autor}</b>
                  <Estrellas valor={r.estrellas} />
                </div>
                {r.comentario && (
                  <div className="mini" style={{ marginTop: 3 }}>
                    “{r.comentario}”
                  </div>
                )}
              </div>
            ))}
            {reseñas.datos?.datos.length === 0 && <p className="mini">Aún no tienes reseñas.</p>}
            <p className="mini" style={{ marginTop: 8 }}>
              Con menos de 3 calificaciones se muestra “Nuevo”.
            </p>
            <Link className="btn sm" href={RUTAS.misResenas} style={{ marginTop: 8 }}>
              Ver todas
            </Link>
          </div>
        </aside>
        <section className="stack">
          <div className="panel" data-panel="camino">
            <h2>
              Niveles <small>{kg(datos.kgTotal)} kg acumulados</small>
            </h2>
            <div className="grid3" style={{ gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
              {datos.niveles.map((n, i) => {
                const logrado = datos.kgTotal >= n.kgMin;
                return (
                  <div key={n.numero} style={{ textAlign: 'center', opacity: logrado ? 1 : 0.45 }}>
                    <div style={{ display: 'grid', placeItems: 'center' }}>
                      <IconoNivel lograda={logrado} color={COLOR_NIVEL[i]!} tamano={56} />
                    </div>
                    <div style={{ font: '700 13px var(--head)', marginTop: 8 }}>{n.nombre}</div>
                    <div className="mini mono">{n.kgMin} kg</div>
                  </div>
                );
              })}
            </div>
            <hr className="divl" />
            <h2 style={{ marginTop: 6 }}>
              Insignias especiales{' '}
              <small>
                <Link href={RUTAS.insignias} style={{ color: 'var(--deep)', fontWeight: 700 }}>
                  ver todas
                </Link>
              </small>
            </h2>
            <div className="grid2" style={{ gap: 12 }} data-especiales>
              {datos.especiales.map((s) => (
                <div
                  key={s.codigo}
                  data-insignia={s.codigo}
                  data-lograda={s.lograda}
                  className="row g16"
                  style={{
                    border: '2px solid var(--ink)',
                    borderRadius: 16,
                    padding: 14,
                    background: s.lograda ? '#F3FAE6' : '#fff',
                    opacity: s.lograda ? 1 : 0.6,
                  }}
                >
                  <span className="ico" style={{ background: s.lograda ? COLOR_INSIGNIA[s.codigo] : '#EFE8D6' }}>
                    <Icono nombre={s.lograda ? (ICONO_INSIGNIA[s.codigo] ?? 'i-star') : 'i-lock'} />
                  </span>
                  <div>
                    <b style={{ font: '700 15px var(--head)' }}>{s.nombre}</b>
                    <div className="mini">{s.descripcion}</div>
                    {s.lograda ? (
                      <span className="pill open" style={{ marginTop: 6 }}>
                        <i />
                        Lograda
                      </span>
                    ) : (
                      <span className="mini mono">
                        {kg(s.actual)}/{kg(s.meta)} {s.unidad}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel" data-panel="historial">
            <h2>
              Historial de operaciones <small>solo las completadas</small>
            </h2>
            {datos.historial.length === 0 ? (
              <p className="mini">Aún no completaste operaciones.</p>
            ) : (
              <table className="tbl" tabIndex={0}>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Con</th>
                    <th>Total</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.historial.map((h) => (
                    <tr key={`${h.fecha}-${h.negocio}-${h.kg}`}>
                      <td>
                        <b>{h.material}</b> · {kg(h.kg)} kg
                      </td>
                      <td>{h.negocio}</td>
                      <td className="mono">{h.total === null ? '—' : formatearSoles(h.total)}</td>
                      <td className="mini">{formatearFecha(h.fecha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Link className="btn sm" href={RUTAS.historial} style={{ marginTop: 12 }}>
              Ver historial completo
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

export function PerfilReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
