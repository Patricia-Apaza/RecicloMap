'use client';

import { formatearHace, NOMBRE_MATERIAL } from '@reciclomap/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { EncabezadoPagina, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { AvisoPin } from '@/navegacion/panel-provisional';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { type Barra, GraficoBarras, SinDatos } from '@/negocio/tablero';
import { useAlLlegarAviso } from '@/notificaciones/en-vivo';
import { FONDO_MATERIAL, kilos } from '@/publicaciones/piezas';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import type { CodigoMaterial } from '@reciclomap/shared';

type Resumen = {
  plan: 'GRATIS' | 'PRO';
  mes: string;
  kgRecibidos: { total: number; frenteAlMesAnterior: number | null };
  visitas: number;
  solicitudesLlegada: number;
  kilosPorSemana: Barra[];
  sinDatos: boolean;
  ultimasSolicitudes: Array<{ material: { codigo: CodigoMaterial; nombre: string } | null; cuando: string }>;
  paraHacerHoy: { preciosAntiguos: number; publicacionesNuevas: number; correccionesPendientes: number };
  publicacionesCerca: {
    total: number;
    datos: Array<{
      id: string;
      material: { codigo: CodigoMaterial; nombre: string };
      kg: number;
      tramo: string | null;
    }>;
  };
};

const mesTexto = (mes: string) =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' });

// Pantalla 41: el mes del centro, sus últimas 8 semanas y lo que conviene hacer hoy
function Contenido() {
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [nombre, setNombre] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    pedir<Resumen>('/mi-negocio/resumen')
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => undefined);
    pedir<{ negocio: { nombreComercial: string } | null }>('/mi-negocio')
      .then((respuesta) => vigente && setNombre(respuesta.negocio?.nombreComercial ?? ''))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [version]);
  useAlLlegarAviso(useCallback(() => setVersion((v) => v + 1), []));

  const hoy = datos?.paraHacerHoy;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Panel del centro"
        titulo="Hola,"
        resaltado={nombre || 'tu centro'}
        descripcion={datos ? `Esto pasó con tu centro en ${mesTexto(datos.mes)}.` : undefined}
        acciones={
          <>
            {datos?.plan === 'PRO' && <span className="pill pro">Plan Pro</span>}
            <span className="pill open">
              <i />
              Verificado
            </span>
            <Link className="btn p" href={RUTAS.preciosDemanda}>
              Actualizar precios
            </Link>
          </>
        }
      />
      <AvisoPin />
      {!datos && <span className="girando" aria-label="Cargando" />}
      {datos && (
        <>
          <div className="grid4" style={{ marginBottom: 24 }}>
            <Kpi
              etiqueta="Kg recibidos"
              valor={kilos(datos.kgRecibidos.total)}
              unidad="kg"
              detalle={
                datos.kgRecibidos.frenteAlMesAnterior === null
                  ? 'operaciones completadas este mes'
                  : `${datos.kgRecibidos.frenteAlMesAnterior > 0 ? '+' : ''}${datos.kgRecibidos.frenteAlMesAnterior} % frente al mes anterior`
              }
              icono="i-recycle"
              fondo="mint"
            />
            <Kpi
              etiqueta="Visitas al perfil"
              valor={datos.visitas}
              detalle="recicladores que miraron tu ficha"
              icono="i-eye"
              fondo="sky"
            />
            <Kpi
              etiqueta="Solicitudes de llegada"
              valor={datos.solicitudesLlegada}
              detalle="pidieron indicaciones (no es llegada)"
              icono="i-pin"
              fondo="sand"
            />
            <Kpi
              etiqueta="Publicaciones cerca"
              valor={datos.publicacionesCerca.total}
              detalle="material que podrías comprar"
              icono="i-gift"
              fondo="lilac"
            />
          </div>
          <div className="cols">
            <section className="stack">
              <div className="panel">
                <h2>
                  Kilos recibidos por semana <small>últimas 8 semanas</small>
                </h2>
                {datos.kilosPorSemana.every((b) => b.valor === 0) ? (
                  <SinDatos texto="Aún sin kilos recibidos" />
                ) : (
                  <GraficoBarras
                    serie={datos.kilosPorSemana}
                    titulo="Kilos recibidos por semana"
                    unidad=" kg"
                    color="#CFE3F2"
                  />
                )}
              </div>
              <div className="panel" data-panel="solicitudes">
                <h2>
                  Últimas solicitudes de llegada <small>sin datos personales</small>
                </h2>
                {datos.ultimasSolicitudes.length === 0 ? (
                  <p className="mini">Aún no te piden indicaciones.</p>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Quién</th>
                        <th>Material</th>
                        <th>Cuándo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.ultimasSolicitudes.map((s) => (
                        <tr key={s.cuando}>
                          <td>Reciclador · Juliaca</td>
                          <td>
                            <b>{s.material?.nombre ?? '—'}</b>
                          </td>
                          <td className="mini">{formatearHace(s.cuando)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="note" style={{ marginTop: 12 }}>
                  <Icono nombre="i-info" />
                  <span>
                    Una solicitud de llegada cuenta cuando alguien pide indicaciones. No significa que la persona llegó.
                  </span>
                </div>
              </div>
            </section>
            <aside className="stack">
              <div className="panel" data-panel="hoy">
                <h3>Para hacer hoy</h3>
                <div className="list" style={{ gap: 10 }}>
                  {hoy && hoy.preciosAntiguos > 0 && (
                    <Link className="note warn" href={RUTAS.preciosDemanda} style={{ textDecoration: 'none' }}>
                      <Icono nombre="i-alert" />
                      <span>
                        <b>
                          {hoy.preciosAntiguos} {hoy.preciosAntiguos === 1 ? 'precio con' : 'precios con'} más de 7 días
                        </b>{' '}
                        sin actualizar. Los recicladores desconfían de precios viejos.
                      </span>
                    </Link>
                  )}
                  {hoy && hoy.correccionesPendientes > 0 && (
                    <Link className="note warn" href={RUTAS.reportesNegocio} style={{ textDecoration: 'none' }}>
                      <Icono nombre="i-alert" />
                      <span>
                        <b>
                          {hoy.correccionesPendientes}{' '}
                          {hoy.correccionesPendientes === 1 ? 'corrección pedida' : 'correcciones pedidas'}
                        </b>{' '}
                        por la administración.
                      </span>
                    </Link>
                  )}
                  {hoy && hoy.publicacionesNuevas > 0 && (
                    <Link className="note" href={RUTAS.publicacionesCercanas} style={{ textDecoration: 'none' }}>
                      <Icono nombre="i-gift" />
                      <span>
                        <b>
                          {hoy.publicacionesNuevas}{' '}
                          {hoy.publicacionesNuevas === 1 ? 'publicación nueva' : 'publicaciones nuevas'}
                        </b>{' '}
                        de material que compras.
                      </span>
                    </Link>
                  )}
                  {hoy && hoy.preciosAntiguos + hoy.correccionesPendientes + hoy.publicacionesNuevas === 0 && (
                    <p className="mini">Todo al día. No tienes nada pendiente.</p>
                  )}
                </div>
              </div>
              <div className="panel">
                <h2>
                  Publicaciones cerca <small>de recicladores</small>
                </h2>
                <div className="list">
                  {datos.publicacionesCerca.datos.length === 0 && (
                    <p className="mini">No hay publicaciones cerca por ahora.</p>
                  )}
                  {datos.publicacionesCerca.datos.map((p) => (
                    <div
                      key={p.id}
                      className="row g16"
                      style={{ border: '2px solid var(--ink)', borderRadius: 14, padding: '10px 12px' }}
                    >
                      <span className="mi" style={{ background: FONDO_MATERIAL[p.material.codigo] }}>
                        <Icono nombre={ICONO_MATERIAL[p.material.codigo]} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <b style={{ font: '700 15px var(--head)' }}>
                          {NOMBRE_MATERIAL[p.material.codigo]} · {kilos(p.kg)} kg
                        </b>
                        <div className="mini">Juliaca{p.tramo ? ` · a ${p.tramo}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <Link className="btn sm" href={RUTAS.publicacionesCercanas} style={{ marginTop: 14 }}>
                  Ver todas <Icono nombre="i-arrow-right" />
                </Link>
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  );
}

export function ResumenCentro() {
  return (
    <Protegida roles={['CENTRO']}>
      <MarcoApp activa="res">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
