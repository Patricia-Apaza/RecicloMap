'use client';

import { formatearHace, formatearNumero } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useAviso } from '@/diseno/avisos';
import { BarraProgreso, EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { Protegida } from '@/sesion/protegida';
import { kg } from './piezas';
import type { RespuestaPuntos } from './tipos';
import { useDatos } from './usar-datos';

// Pantalla 30: puntos, nivel, giros y movimientos
function Contenido() {
  const aviso = useAviso();
  const { datos, fallo } = useDatos<RespuestaPuntos>('/yo/puntos');
  if (!datos) {
    return fallo ? (
      <EstadoVacio
        icono="i-alert"
        titulo="No pudimos cargar tus puntos"
        descripcion="Intenta de nuevo en un momento."
      />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(datos.invitacion.codigo);
    } catch {
      // Si el navegador no deja copiar, el código sigue visible
    }
    aviso(`Código copiado: ${datos.invitacion.codigo}`);
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Puntos y niveles"
        titulo="Cada kilo"
        resaltado="suma"
        descripcion="1 punto por kilo reciclado. Cada 500 puntos de reciclaje ganas un giro de la ruleta. Los puntos no son dinero ni se convierten en dinero."
        acciones={
          <div className="row g8 wr">
            <Link className="btn" href={RUTAS.niveles}>
              <Icono nombre="i-trophy" />
              Ver mis niveles
            </Link>
            <Link className="btn p" href={RUTAS.ruleta}>
              <Icono nombre="i-gift" />
              Ir a la ruleta
            </Link>
          </div>
        }
      />
      <div className="grid4" style={{ marginBottom: 24 }} data-kpis>
        <Kpi etiqueta="Puntos" icono="i-star" valor={formatearNumero(datos.puntos)} detalle="1 punto por kg" />
        <Kpi etiqueta="Kg reciclados" icono="i-recycle" valor={kg(datos.kgTotal)} unidad="kg" detalle="Acumulado" />
        <Kpi
          etiqueta="Nivel"
          icono="i-trophy"
          valor={`${datos.nivel.numero} · ${datos.nivel.nombre}`}
          detalle={
            datos.siguiente ? `Faltan ${kg(datos.siguiente.faltan)} kg para ${datos.siguiente.nombre}` : 'Nivel máximo'
          }
        />
        <Kpi
          etiqueta="Giros"
          icono="i-gift"
          valor={String(datos.giros.disponibles)}
          detalle={`Próximo giro en ${datos.giros.faltan} pts`}
        />
      </div>
      <div className="cols">
        <section className="stack">
          <div className="panel" data-panel="desafios">
            <h2>
              Desafíos de {datos.desafios.mes} <small>se reinician cada mes</small>
            </h2>
            <div className="list">
              {datos.desafios.items.map((d) => {
                const listo = d.estado !== 'EN_PROGRESO';
                return (
                  <div
                    key={d.id}
                    style={{
                      border: '2px solid var(--ink)',
                      borderRadius: 16,
                      padding: '14px 16px',
                      background: listo ? '#F3FAE6' : '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div className="row sp wr">
                      <b style={{ font: '700 16px var(--head)', color: 'var(--ink)' }}>{d.nombre}</b>
                      <span className={listo ? 'pill open' : 'pill blue'}>
                        {listo ? (
                          <>
                            <i />
                            {d.estado === 'RECLAMADO' ? 'Reclamado' : 'Completado'}
                          </>
                        ) : (
                          `+${d.puntos} puntos`
                        )}
                      </span>
                    </div>
                    <div className="row g16">
                      <div style={{ flex: 1 }}>
                        <BarraProgreso valor={d.progreso} maximo={d.meta} etiqueta={d.nombre} />
                      </div>
                      <span className="mono" style={{ font: '600 13px var(--mono)' }}>
                        {kg(d.progreso)}/{kg(d.meta)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Link className="btn sm" href={RUTAS.desafios} style={{ marginTop: 14 }}>
              Ver todos los desafíos
            </Link>
          </div>
          <div className="panel" data-panel="historial">
            <h2>
              Historial <small>últimos movimientos</small>
            </h2>
            {datos.movimientos.length === 0 ? (
              <p className="mini">Aún no tienes movimientos. Tus puntos aparecen cuando una operación se completa.</p>
            ) : (
              <table className="tbl" tabIndex={0}>
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>Cuándo</th>
                    <th style={{ textAlign: 'right' }}>Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td>{m.descripcion}</td>
                      <td className="mini">{formatearHace(m.fecha)}</td>
                      <td
                        className="mono"
                        style={{ textAlign: 'right', color: m.puntos < 0 ? 'var(--err, #A83226)' : 'var(--ok)' }}
                      >
                        {m.puntos > 0 ? '+' : ''}
                        {m.puntos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <aside className="stack">
          <div className="panel" data-panel="niveles">
            <h2>
              Tus niveles <small>por kg acumulados</small>
            </h2>
            <div className="list" style={{ gap: 8 }}>
              {datos.niveles.map((n) => {
                const logrado = datos.kgTotal >= n.kgMin;
                const actual = n.numero === datos.nivel.numero;
                return (
                  <div
                    key={n.numero}
                    className="row g16"
                    style={{
                      padding: '9px 12px',
                      borderRadius: 14,
                      border: `2px solid ${actual ? 'var(--ink)' : 'transparent'}`,
                      background: actual ? 'var(--lime)' : 'transparent',
                      opacity: logrado ? 1 : 0.5,
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: '2px solid var(--ink)',
                        display: 'grid',
                        placeItems: 'center',
                        font: '600 13px var(--mono)',
                        background: logrado ? 'var(--btn)' : '#fff',
                        color: logrado ? '#fff' : 'var(--ink)',
                      }}
                    >
                      {n.numero}
                    </span>
                    <b style={{ flex: 1, font: '700 15px var(--head)' }}>{n.nombre}</b>
                    <span className="mono mini">{n.kgMin.toLocaleString('es-PE')} kg</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel" data-panel="entregas">
            <h3>Entrega directa</h3>
            <p className="mini" style={{ margin: '4px 0 12px' }}>
              ¿Entregaste material a un negocio sin publicarlo? Regístralo y que el negocio lo confirme para sumar
              kilos.
            </p>
            <Link className="btn sm" href={RUTAS.entregasDirectas}>
              Registrar entrega directa
            </Link>
          </div>
          <div className="panel dark" data-panel="invitar">
            <h3>Invita amigos</h3>
            <p style={{ color: '#cfe4d8', fontSize: 14, marginBottom: 12 }}>
              Tú y tu amigo ganan {datos.invitacion.puntosPorInvitado} puntos de bono cuando completa su primera
              operación.
            </p>
            <div className="row g8">
              <div
                style={{
                  flex: 1,
                  border: '2px dashed var(--lime)',
                  borderRadius: 14,
                  padding: 12,
                  textAlign: 'center',
                  font: '600 20px var(--mono)',
                  letterSpacing: '.1em',
                  color: 'var(--lime)',
                }}
                data-codigo
              >
                {datos.invitacion.codigo}
              </div>
              <button
                type="button"
                className="btn sm"
                style={{ background: 'var(--lime)' }}
                onClick={() => void copiar()}
              >
                Copiar
              </button>
            </div>
            <div className="row sp" style={{ marginTop: 14, fontSize: 13, color: '#cfe4d8' }}>
              <span>
                {datos.invitacion.invitados} {datos.invitacion.invitados === 1 ? 'amigo invitado' : 'amigos invitados'}
              </span>
              <span>+{datos.invitacion.puntosGanados} puntos ganados</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export function PuntosReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
