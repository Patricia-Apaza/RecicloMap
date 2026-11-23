'use client';

import { NOMBRE_MATERIAL, type PeriodoEstadisticas, PERIODOS_ESTADISTICAS } from '@reciclomap/shared';
import { useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { EncabezadoPagina, Kpi } from '@/diseno/bloques';
import { EtiquetaDemanda, EtiquetaSemaforo } from '@/diseno/etiquetas';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { FONDO_MATERIAL, kilos, soles } from '@/publicaciones/piezas';
import { Protegida } from '@/sesion/protegida';
import { BloquePro, esRequierePro, GraficoBarras, SinDatos, useEstadisticas } from './tablero';

const TEXTO_PERIODO: Record<PeriodoEstadisticas, string> = { 7: '7 días', 30: '30 días', 90: '90 días' };
const TEXTO_BARRA: Record<PeriodoEstadisticas, string> = { 7: 'por día', 30: 'por semana', 90: 'por mes' };
const horaTexto = (hora: number) => `${String(hora).padStart(2, '0')}:00`;

// Pantallas 50 (centro) y 53 (comprador móvil): los mismos números; solo cambia lo que va primero
function Contenido({ movil }: { movil: boolean }) {
  const [periodo, setPeriodo] = useState<PeriodoEstadisticas>(30);
  const { datos, error } = useEstadisticas(periodo);
  const bloqueado = datos?.requierePro === true;
  const sinDatos = datos?.sinDatos === true;

  const grafico = (clave: 'visitas' | 'kg') =>
    datos?.[clave] && (
      <div className="panel" data-panel={clave}>
        <h2>
          {clave === 'visitas' ? 'Visitas a tu perfil' : 'Kg comprados'} <small>{TEXTO_BARRA[periodo]}</small>
        </h2>
        <GraficoBarras
          serie={datos[clave].serie}
          titulo={clave === 'visitas' ? 'Visitas al perfil' : 'Kilos comprados'}
          unidad={clave === 'kg' ? ' kg' : ''}
          color={clave === 'kg' ? '#F4E4BE' : '#CFE3F2'}
        />
        {clave === 'kg' && <p className="mini">Solo operaciones completadas, con los kilos que confirmaste.</p>}
      </div>
    );

  return (
    <>
      <EncabezadoPagina
        antetitulo={movil ? 'Comprador móvil' : 'Mi negocio'}
        titulo={movil ? 'Tus' : 'Cómo te'}
        resaltado={movil ? 'estadísticas' : 'encuentran'}
        descripcion={
          movil
            ? 'Cuánto compras, de qué material y cómo están tus precios frente a los demás. Solo tú ves estos números.'
            : 'Visitas a tu perfil, interés y ofertas. Solo tú ves estos números.'
        }
        acciones={
          <div className="seg" role="group" aria-label="Período">
            {PERIODOS_ESTADISTICAS.map((p) => (
              <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}>
                {TEXTO_PERIODO[p]}
                {p === 90 && datos?.plan === 'GRATIS' && ' · Pro'}
              </button>
            ))}
          </div>
        }
      />
      {error && (
        <div className="note warn" role="alert">
          {error}
        </div>
      )}
      {!datos && !error && <span className="girando" role="status" aria-label="Cargando" />}
      {bloqueado && (
        <BloquePro
          titulo="Estadísticas de 90 días"
          descripcion="El período de 90 días, las horas con más visitas y los materiales más consultados son del plan Pro."
        />
      )}
      {datos && !bloqueado && sinDatos && <SinDatos texto="Aún sin datos en este período" />}
      {datos && !bloqueado && !sinDatos && datos.visitas && datos.llegadas && datos.ofertas && datos.kg && (
        <>
          <div className="grid4" style={{ marginBottom: 24 }}>
            <Kpi
              etiqueta="Visitas al perfil"
              valor={datos.visitas.total}
              detalle="personas distintas"
              icono="i-user"
              fondo="sky"
            />
            <Kpi
              etiqueta="«Cómo llegar»"
              valor={datos.llegadas.total}
              detalle={
                datos.visitas.total > 0
                  ? `${Math.round((datos.llegadas.total / datos.visitas.total) * 100)} % de las visitas`
                  : 'pidieron indicaciones'
              }
              icono="i-nav"
              fondo="sand"
            />
            <Kpi
              etiqueta="Ofertas enviadas"
              valor={datos.ofertas.enviadas}
              detalle={`${datos.ofertas.aceptadas} aceptadas`}
              icono="i-gift"
              fondo="mint"
            />
            <Kpi
              etiqueta="Kg comprados"
              valor={kilos(datos.kg.total)}
              unidad="kg"
              detalle={`${datos.kg.compras} operaciones completadas`}
              icono="i-recycle"
              fondo="lilac"
            />
          </div>
          <div className="cols">
            <section className="stack">
              {movil ? grafico('kg') : grafico('visitas')}
              {movil ? grafico('visitas') : grafico('kg')}
              {datos.llegadas.total > 0 && (
                <div className="panel" data-panel="llegadas">
                  <h2>
                    «Cómo llegar» por material <small>solo conteo</small>
                  </h2>
                  <div className="list" style={{ gap: 8 }}>
                    {datos.llegadas.porMaterial.map((m) => (
                      <div key={m.material} className="row sp">
                        <b>{NOMBRE_MATERIAL[m.material]}</b>
                        <span className="mono">{m.cantidad}</span>
                      </div>
                    ))}
                    {datos.llegadas.sinMaterial > 0 && (
                      <div className="row sp" data-sin-material>
                        <b>Sin material indicado</b>
                        <span className="mono">{datos.llegadas.sinMaterial}</span>
                      </div>
                    )}
                  </div>
                  <p className="mini" style={{ marginTop: 10 }}>
                    Una solicitud cuenta cuando alguien pide indicaciones; no significa que llegó. Nunca mostramos quién
                    fue.
                  </p>
                </div>
              )}
              {datos.horasConMasVisitas && esRequierePro(datos.horasConMasVisitas) ? (
                <BloquePro
                  titulo="Horas con más visitas"
                  descripcion="Descubre a qué hora te buscan los recicladores."
                />
              ) : (
                Array.isArray(datos.horasConMasVisitas) && (
                  <div className="panel" data-panel="horas">
                    <h2>
                      Horas con más visitas <small>cuándo te buscan</small>
                    </h2>
                    {datos.horasConMasVisitas.length === 0 ? (
                      <p className="mini">Aún no hay visitas en este período.</p>
                    ) : (
                      <GraficoBarras
                        serie={datos.horasConMasVisitas.map((h) => ({
                          desde: `h${h.hora}`,
                          hasta: `h${h.hora}`,
                          valor: h.visitas,
                        }))}
                        etiqueta={(b) => horaTexto(Number(b.desde.slice(1)))}
                        titulo="Visitas por hora"
                        color="#F4E4BE"
                      />
                    )}
                  </div>
                )
              )}
            </section>
            <aside className="stack">
              {datos.materialesMasConsultados && esRequierePro(datos.materialesMasConsultados) ? (
                <BloquePro titulo="Materiales más consultados" descripcion="Mira qué material buscan en tu ficha." />
              ) : (
                Array.isArray(datos.materialesMasConsultados) && (
                  <div className="panel" data-panel="consultados">
                    <h3>Materiales más consultados</h3>
                    <div className="list" style={{ gap: 12 }}>
                      {datos.materialesMasConsultados.length === 0 && (
                        <p className="mini">Aún sin consultas con material.</p>
                      )}
                      {datos.materialesMasConsultados.map((m) => (
                        <div key={m.material}>
                          <div className="row sp" style={{ marginBottom: 5 }}>
                            <b style={{ fontSize: 14 }}>{NOMBRE_MATERIAL[m.material]}</b>
                            <b className="mono" style={{ fontSize: 13 }}>
                              {m.porcentaje} %
                            </b>
                          </div>
                          <div className="prog" style={{ height: 11 }}>
                            <i style={{ width: `${m.porcentaje}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
              {movil && datos.kg.porMaterial.length > 0 && (
                <div className="panel" data-panel="por-material">
                  <h3>Por material</h3>
                  <div className="list" style={{ gap: 12 }}>
                    {datos.kg.porMaterial.map((m) => (
                      <div key={m.material}>
                        <div className="row sp" style={{ marginBottom: 5 }}>
                          <b style={{ fontSize: 14 }}>{NOMBRE_MATERIAL[m.material]}</b>
                          <span className="mono" style={{ fontSize: 13 }}>
                            {kilos(m.kg)} kg · {m.porcentaje} %
                          </span>
                        </div>
                        <div className="prog" style={{ height: 11 }}>
                          <i style={{ width: `${m.porcentaje}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
      {datos && !bloqueado && datos.precioFrenteAlMercado && (
        <div className="panel" style={{ marginTop: 24 }} data-panel="mercado">
          <h2>
            Tu precio frente al mercado <small>mismo material, quienes compran cerca</small>
          </h2>
          <div className="list" style={{ gap: 0 }}>
            {datos.precioFrenteAlMercado.length === 0 && <p className="mini">Aún no tienes precios publicados.</p>}
            {datos.precioFrenteAlMercado.map((m) => (
              <div
                key={m.material.codigo}
                className="row sp wr"
                style={{ padding: '12px 0', borderBottom: '1.5px solid var(--line)' }}
                data-material={m.material.codigo}
              >
                <span className="row g8" style={{ width: 150 }}>
                  <span
                    className="mi"
                    style={{ width: 34, height: 34, borderRadius: 10, background: FONDO_MATERIAL[m.material.codigo] }}
                  >
                    <Icono nombre={ICONO_MATERIAL[m.material.codigo]} tamano="sm" />
                  </span>
                  <b style={{ font: '700 15px var(--head)' }}>{m.material.nombre}</b>
                </span>
                <span className="mono" style={{ fontSize: 13.5 }}>
                  {soles(m.min)}–{Number(m.max).toFixed(2)}
                </span>
                {m.semaforo ? (
                  <EtiquetaSemaforo semaforo={m.semaforo.clave} />
                ) : (
                  <span className="pill grey">{m.moderacion ? 'No se muestra en el mapa' : 'Sin comparación'}</span>
                )}
                <EtiquetaDemanda demanda={m.demanda} />
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 14 }}>
            <Icono nombre="i-info" />
            <span>
              El semáforo es relativo: compara tu punto medio con el de los demás compradores del material a 5 km, igual
              que en el mapa y en ambos planes. No dice si un precio es justo ni muestra a otros negocios.
            </span>
          </div>
        </div>
      )}
    </>
  );
}

export function PanelEstadisticas({ movil }: { movil: boolean }) {
  return (
    <Protegida roles={movil ? ['COMPRADOR_MOVIL'] : ['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa={movil ? 'est' : ''}>
        <Contenido movil={movil} />
      </MarcoApp>
    </Protegida>
  );
}
