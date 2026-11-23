'use client';

import { formatearFechaHora, formatearHace, TEXTO_MOTIVO_REPORTE } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { useAlLlegarAviso } from '@/notificaciones/en-vivo';
import { PildoraReporte } from '@/reportes/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Filtro = 'todos' | 'correccion' | 'revision' | 'resueltos';
type Reporte = {
  id: string;
  motivo: string;
  estado: string;
  detalle: string | null;
  material: { nombre: string } | null;
  creadoEn: string;
  correccion: { motivo: string | null; plazoHasta: string | null; texto: string; enlace: string } | null;
  decision: string | null;
};
type Respuesta = { conteos: Record<Filtro, number>; datos: Reporte[] };
const FILTROS: Array<[Filtro, string]> = [
  ['todos', 'Todos'],
  ['correccion', 'Piden corrección'],
  ['revision', 'En revisión'],
  ['resueltos', 'Resueltos'],
];

// Pantalla 49: el motivo y el estado, nunca quién reportó
function Contenido() {
  const aviso = useAviso();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>(`/mi-negocio/reportes?estado=${filtro}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos(null));
    return () => {
      vigente = false;
    };
  }, [filtro, version]);

  useAlLlegarAviso(useCallback(() => setVersion((v) => v + 1), []));

  const corregido = async (id: string) => {
    try {
      await pedir(`/mi-negocio/reportes/${id}/corregido`, { cuerpo: {} });
      aviso('Avisaste al administrador. Lo revisará.');
      setVersion((v) => v + 1);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos avisar al administrador.');
    }
  };

  const pendientes = datos?.datos.filter((r) => r.estado === 'CORRECCION_PEDIDA') ?? [];
  const primero = pendientes[0]?.correccion?.plazoHasta;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi negocio"
        titulo="Reportes sobre"
        resaltado="tu negocio"
        descripcion="Cuando alguien avisa que algo no coincide, lo revisa un administrador. Si pide una corrección, tienes un plazo."
      />
      {datos && datos.conteos.correccion > 0 && filtro !== 'resueltos' && (
        <div className="note warn" style={{ marginBottom: 20 }} role="status">
          <Icono nombre="i-alert" />
          <span>
            <b>
              Tienes {datos.conteos.correccion}{' '}
              {datos.conteos.correccion === 1 ? 'corrección pendiente' : 'correcciones pendientes'}.
            </b>
            {primero && ` Plazo: ${formatearFechaHora(primero)}.`} Si no corriges, tu visibilidad puede suspenderse.
          </span>
        </div>
      )}
      <div className="cols">
        <section className="panel">
          <div className="seg" role="group" aria-label="Estado" style={{ marginBottom: 16 }}>
            {FILTROS.map(([clave, texto]) => (
              <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
                {texto} {datos?.conteos[clave] ?? ''}
              </button>
            ))}
          </div>
          <div className="list">
            {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
            {datos?.datos.length === 0 && (
              <EstadoVacio
                titulo="Sin reportes"
                descripcion="Cuando alguien avise algo sobre tu negocio aparecerá aquí."
              />
            )}
            {datos?.datos.map((r) => (
              <div
                key={r.id}
                data-reporte={r.id}
                style={{
                  border: '2px solid var(--ink)',
                  borderRadius: 16,
                  padding: '14px 16px',
                  boxShadow: '3px 3px 0 var(--ink)',
                }}
              >
                <div className="row sp wr">
                  <div className="row g8">
                    <PildoraReporte estado={r.estado} />
                    <b style={{ font: '700 16px var(--head)' }}>
                      {TEXTO_MOTIVO_REPORTE[r.motivo]}
                      {r.material && ` · ${r.material.nombre}`}
                    </b>
                  </div>
                  <span className="mini">{formatearHace(r.creadoEn)}</span>
                </div>
                {r.detalle && <p style={{ margin: '8px 0' }}>{r.detalle}</p>}
                {r.correccion && (
                  <>
                    <div className="note warn">
                      <Icono nombre="i-clock" />
                      <span>
                        <b>Plazo: {r.correccion.plazoHasta ? formatearFechaHora(r.correccion.plazoHasta) : '—'}.</b>{' '}
                        {r.correccion.motivo && `${r.correccion.motivo}. `}
                        {r.correccion.texto}
                      </span>
                    </div>
                    <div className="row g8 wr" style={{ marginTop: 10 }}>
                      <Link className="btn p sm" href={r.correccion.enlace}>
                        Corregir ahora
                      </Link>
                      <button type="button" className="btn sm" onClick={() => void corregido(r.id)}>
                        Ya lo corregí
                      </button>
                    </div>
                  </>
                )}
                {r.decision && (
                  <p className="mini" style={{ margin: '6px 0 0' }}>
                    Decisión: {r.decision}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>Cómo se resuelve</h3>
            <div className="list" style={{ gap: 10 }}>
              {[
                ['var(--sky)', 'Alguien reporta un dato.'],
                ['var(--sand)', 'Un administrador lo revisa y, si corresponde, te pide corregir con plazo.'],
                ['var(--mint)', 'Corriges tu dato. Si no, tu visibilidad puede suspenderse con motivo.'],
              ].map(([fondo, texto], indice) => (
                <div key={texto} className="row g16" style={{ alignItems: 'flex-start' }}>
                  <span className="mi" style={{ background: fondo }}>
                    {indice + 1}
                  </span>
                  <span>{texto}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="note">
            <Icono nombre="i-lock" />
            <span>
              El administrador nunca cambia tus precios: solo tú puedes editarlos. No te mostramos quién envió cada
              reporte.
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}

export function ReportesNegocio() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
