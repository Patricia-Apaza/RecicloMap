'use client';

import {
  NOMBRE_MATERIAL,
  formatearHace,
  formatearNumero,
  type CodigoMaterial,
  type PeriodoPanel,
  PERIODOS_PANEL,
} from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useEffect, useState } from 'react';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { GraficoBarras } from '@/negocio/tablero';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type BloquesPanel = {
  parametros: Array<{ clave: string; etiqueta: string; anterior: string; nuevo: string; fecha: string }>;
  ciudades: Array<{ id: number; nombre: string; estado: 'ACTIVA' | 'PROXIMAMENTE'; listaEspera: number }>;
  ruleta: {
    enPausa: boolean;
    girosUsados: number;
    premiosPorEntregar: number;
    premiosPorVencer: number;
    stockBajo: number;
  };
};
type Panel = {
  bloques: BloquesPanel;
  pendientes: {
    total: number;
    verificaciones: number;
    cambiosDireccion: number;
    reportes: number;
    incidencias: number;
    solicitudesPlan: number;
    preciosMarcados: number;
    masAntiguos: Array<{ tipo: string; titulo: string; desde: string; enlace: string }>;
  };
  metricas: {
    periodo: PeriodoPanel;
    desde: string;
    hasta: string;
    sinDatos: boolean;
    usuarios: {
      total: number;
      porRol: Record<'RECICLADOR' | 'CENTRO' | 'COMPRADOR_MOVIL' | 'ADMIN', number>;
      porCiudad: Array<{ ciudad: string; total: number }>;
      nuevos: number;
      suspendidos: number;
      porSemana: Array<{ desde: string; valor: number }>;
    };
    negocios: { centrosVerificados: number; movilesVerificados: number };
    operaciones: { completadas: number; canceladas: number; enCurso: number; tasaCierre: number | null };
    kilos: { total: number; porMaterial: Array<{ material: CodigoMaterial; kg: number }> };
    incidencias: { abiertas: number; creadas: number; resueltas: number };
    embudo: { publicaciones: number; conOfertas: number; aceptadas: number; completadas: number };
  };
};

const sumarDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const AVISO_SIN_DATOS = 'Aún sin datos';

// Pantalla 57: lo pendiente y métricas reales de la plataforma. Solo conteos; nada de personas
function Contenido() {
  const [periodo, setPeriodo] = useState<PeriodoPanel>(30);
  const [datos, setDatos] = useState<Panel | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vigente = true;
    pedir<Panel>(`/admin/panel?periodo=${periodo}`)
      .then((r) => vigente && (setDatos(r), setError(false)))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [periodo]);

  if (!datos) {
    return error ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar el panel" descripcion="Intenta de nuevo en un momento." />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const { pendientes: p, metricas: m, bloques: b } = datos;
  const embudo = [
    ['Publicaciones', m.embudo.publicaciones],
    ['Con ofertas', m.embudo.conOfertas],
    ['Aceptadas', m.embudo.aceptadas],
    ['Completadas', m.embudo.completadas],
  ] as const;
  const maximoKg = Math.max(...m.kilos.porMaterial.map((x) => x.kg), 1);

  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Panel"
        resaltado="de control"
        descripcion="Revisa lo pendiente y cómo se usa la plataforma. Puedes aprobar, marcar y pedir correcciones, pero nunca cambiar un precio."
        acciones={
          <div className="seg" role="group" aria-label="Período">
            {PERIODOS_PANEL.map((d) => (
              <button key={d} type="button" aria-pressed={periodo === d} onClick={() => setPeriodo(d)}>
                {d} días
              </button>
            ))}
          </div>
        }
      />
      <div className="grid4" style={{ marginBottom: 24 }} data-kpis>
        <Kpi
          etiqueta="Usuarios"
          icono="i-user"
          valor={formatearNumero(m.usuarios.total)}
          detalle={`+${m.usuarios.nuevos} en ${periodo} días`}
        />
        <Kpi
          etiqueta="Negocios verificados"
          icono="i-shield"
          valor={formatearNumero(m.negocios.centrosVerificados + m.negocios.movilesVerificados)}
          detalle={`${m.negocios.centrosVerificados} centros · ${m.negocios.movilesVerificados} móviles`}
        />
        <Kpi
          etiqueta="Pendientes"
          icono="i-clock"
          valor={<span data-pendientes-total>{p.total}</span>}
          detalle="Esperando revisión"
        />
        <Kpi etiqueta="Precios marcados" icono="i-alert" valor={p.preciosMarcados} detalle="Con seguimiento abierto" />
      </div>
      <div className="cols">
        <section className="stack">
          <div className="panel" data-panel="pendientes">
            <h2>
              Para revisar hoy <small>lo más antiguo primero</small>
            </h2>
            <div className="grid3" style={{ marginBottom: 14, gap: 10 }}>
              {[
                ['Verificaciones', p.verificaciones, RUTAS.adminVerificaciones, 'verificaciones'],
                ['Cambios de dirección', p.cambiosDireccion, RUTAS.adminVerificaciones, 'cambios'],
                ['Reportes', p.reportes, RUTAS.adminReportes, 'reportes'],
                ['Incidencias', p.incidencias, RUTAS.adminIncidencias, 'incidencias'],
                ['Solicitudes de plan', p.solicitudesPlan, RUTAS.adminPlan, 'plan'],
              ].map(([texto, cuantos, ruta, clave]) => (
                <Link
                  key={String(clave)}
                  href={String(ruta)}
                  className="btn"
                  data-pendiente={clave}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span>{texto}</span>
                  <b className="mono">{cuantos}</b>
                </Link>
              ))}
            </div>
            {p.masAntiguos.length === 0 ? (
              <EstadoVacio icono="i-check" titulo="Nada pendiente" descripcion="Todo lo que llega queda atendido." />
            ) : (
              <div className="list">
                {p.masAntiguos.map((f, i) => (
                  <Link
                    key={`${f.tipo}-${i}`}
                    href={f.enlace}
                    className="row sp wr"
                    style={{ padding: '8px 0', borderBottom: '1.5px solid var(--line)' }}
                  >
                    <b>{f.titulo}</b>
                    <span className="mini">{formatearHace(f.desde)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="panel" data-panel="usuarios-nuevos">
            <h2>
              Usuarios nuevos por semana <small>últimas 8 semanas</small>
            </h2>
            <GraficoBarras
              titulo="Usuarios nuevos por semana"
              serie={m.usuarios.porSemana.map((s) => ({
                desde: s.desde,
                hasta: sumarDias(s.desde, 6),
                valor: s.valor,
              }))}
            />
          </div>
          <div className="panel" data-panel="embudo">
            <h2>
              Del anuncio al cierre <small>publicaciones de los últimos {periodo} días</small>
            </h2>
            {m.sinDatos ? (
              <p className="mini">{AVISO_SIN_DATOS} en este período.</p>
            ) : (
              <div className="list" style={{ gap: 12 }}>
                {embudo.map(([texto, valor]) => (
                  <div key={texto}>
                    <div className="row sp">
                      <b>{texto}</b>
                      <span className="mono">{valor}</span>
                    </div>
                    <div className="prog">
                      <i style={{ width: `${Math.round((valor / Math.max(m.embudo.publicaciones, 1)) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <aside className="stack">
          <div className="panel" data-panel="operaciones">
            <h3>Operaciones</h3>
            <table className="tbl" tabIndex={0}>
              <tbody>
                <tr>
                  <td>Completadas</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.operaciones.completadas}
                  </td>
                </tr>
                <tr>
                  <td>Canceladas</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.operaciones.canceladas}
                  </td>
                </tr>
                <tr>
                  <td>En curso ahora</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.operaciones.enCurso}
                  </td>
                </tr>
                <tr>
                  <td>Tasa de cierre</td>
                  <td className="mono" style={{ textAlign: 'right' }} data-tasa-cierre>
                    {m.operaciones.tasaCierre === null ? AVISO_SIN_DATOS : `${m.operaciones.tasaCierre} %`}
                  </td>
                </tr>
                <tr>
                  <td>Incidencias abiertas</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.incidencias.abiertas}
                  </td>
                </tr>
                <tr>
                  <td>Incidencias resueltas ({periodo} d)</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.incidencias.resueltas}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mini" style={{ marginTop: 8 }}>
              Tasa de cierre: completadas entre las que terminaron en el período (completadas + canceladas).
            </p>
          </div>
          <div className="panel" data-panel="kilos">
            <h3>
              Kg movidos <small>{formatearNumero(m.kilos.total)} kg</small>
            </h3>
            {m.kilos.porMaterial.length === 0 ? (
              <p className="mini">{AVISO_SIN_DATOS} en este período.</p>
            ) : (
              <div className="list" style={{ gap: 12 }}>
                {m.kilos.porMaterial.map((x) => (
                  <div key={x.material}>
                    <div className="row sp">
                      <b>{NOMBRE_MATERIAL[x.material]}</b>
                      <span className="mono">{formatearNumero(x.kg)} kg</span>
                    </div>
                    <div className="prog">
                      <i style={{ width: `${Math.round((x.kg / maximoKg) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="panel" data-panel="por-rol">
            <h3>Usuarios por rol y ciudad</h3>
            <table className="tbl" tabIndex={0}>
              <tbody>
                <tr>
                  <td>Recicladores</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.usuarios.porRol.RECICLADOR}
                  </td>
                </tr>
                <tr>
                  <td>Centros de acopio</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.usuarios.porRol.CENTRO}
                  </td>
                </tr>
                <tr>
                  <td>Compradores móviles</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.usuarios.porRol.COMPRADOR_MOVIL}
                  </td>
                </tr>
                <tr>
                  <td>Administración</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.usuarios.porRol.ADMIN}
                  </td>
                </tr>
                <tr>
                  <td>Cuentas suspendidas</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {m.usuarios.suspendidos}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="list" style={{ gap: 6, marginTop: 10 }}>
              {m.usuarios.porCiudad.map((c) => (
                <div key={c.ciudad} className="row sp">
                  <span>{c.ciudad}</span>
                  <span className="mono">{c.total}</span>
                </div>
              ))}
            </div>
            <Link className="btn sm" href={RUTAS.adminUsuarios} style={{ marginTop: 12 }}>
              <Icono nombre="i-user" />
              Gestionar usuarios
            </Link>
          </div>
          <div className="panel" data-panel="ruleta">
            <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Ruleta</h2>
            <div className="list" style={{ gap: 6 }}>
              <div className="row sp">
                <span>Estado</span>
                <span className={`pill ${b.ruleta.enPausa ? 'closed' : 'open'}`}>
                  {b.ruleta.enPausa ? 'En pausa' : 'En marcha'}
                </span>
              </div>
              <div className="row sp">
                <span>Giros usados ({periodo} días)</span>
                <span className="mono">{b.ruleta.girosUsados}</span>
              </div>
              <div className="row sp">
                <span>Premios por entregar</span>
                <span className="mono">{b.ruleta.premiosPorEntregar}</span>
              </div>
              <div className="row sp">
                <span>Premios por vencer (3 días)</span>
                <span className="mono">{b.ruleta.premiosPorVencer}</span>
              </div>
              <div className="row sp">
                <span>Premios con stock bajo</span>
                <span className="mono">{b.ruleta.stockBajo}</span>
              </div>
            </div>
            <Link className="btn sm" href={RUTAS.adminPremios} style={{ marginTop: 12 }}>
              <Icono nombre="i-gift" />
              Premios y entregas
            </Link>
          </div>
          <div className="panel" data-panel="ciudades">
            <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Ciudades</h2>
            <div className="list" style={{ gap: 6 }}>
              {b.ciudades.map((c) => (
                <div key={c.id} className="row sp wr">
                  <span>
                    {c.nombre}{' '}
                    <span className={`pill ${c.estado === 'ACTIVA' ? 'open' : 'grey'}`}>
                      {c.estado === 'ACTIVA' ? 'Activa' : 'Próximamente'}
                    </span>
                  </span>
                  {c.estado === 'PROXIMAMENTE' && <span className="mono">{c.listaEspera} en espera</span>}
                </div>
              ))}
            </div>
            <Link className="btn sm" href={RUTAS.adminCiudades} style={{ marginTop: 12 }}>
              <Icono nombre="i-map" />
              Ciudades y zonas
            </Link>
          </div>
          <div className="panel" data-panel="parametros">
            <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Parámetros recientes</h2>
            {b.parametros.length === 0 && <p className="mini">Sin cambios todavía.</p>}
            <div className="list" style={{ gap: 6 }}>
              {b.parametros.map((c, i) => (
                <div key={`${c.clave}-${i}`} className="mini">
                  <b>{c.etiqueta}</b>: {c.anterior} → {c.nuevo} · {formatearHace(c.fecha)}
                </div>
              ))}
            </div>
            <Link className="btn sm" href={RUTAS.adminConfiguracion} style={{ marginTop: 12 }}>
              Configuración general
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}

export function PanelAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="dash">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
