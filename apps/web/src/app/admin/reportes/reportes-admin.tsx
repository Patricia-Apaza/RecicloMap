'use client';

import { formatearFecha, formatearFechaHora, formatearHace, TEXTO_MOTIVO_REPORTE } from '@reciclomap/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Estrellas, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { kilos } from '@/publicaciones/piezas';
import { DialogoDecision, PildoraReporte, PLAZOS_REPORTES } from '@/reportes/piezas';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Pestana = 'NEGOCIO' | 'RESENA' | 'ALERTAS';
type Estado = 'pendientes' | 'en-revision' | 'cerrados';
type Accion = 'PEDIR_CORRECCION' | 'RESOLVER' | 'DESCARTAR' | 'OCULTAR_RESENA';
type Reporte = {
  id: string;
  tipo: 'NEGOCIO' | 'RESENA';
  motivo: string;
  estado: string;
  detalle: string | null;
  precioVisto: string | null;
  decision: string | null;
  plazoHasta: string | null;
  plazoVencido: boolean;
  creadoEn: string;
  autor: { nombre: string; rol: string };
  negocio: { id: string; nombre: string; tipo: string } | null;
  material: { nombre: string } | null;
  resena: {
    id: string;
    estrellas: number;
    comentario: string | null;
    etiquetas: string[];
    creadaEn: string;
    autor: string;
    destino: string;
    reportes: number;
    oculta: { motivo: string; creadaEn: string } | null;
  } | null;
  acciones: Accion[];
};
type Lista = {
  conteos: Record<'NEGOCIO' | 'RESENA', Record<Estado, number>> & { OPERACION: { abiertas: number; cerrados: number } };
  plazosVencidos: number;
  datos: Reporte[];
};
type Alertas = {
  umbrales: { operacionesPar: number; desvioPct: number; kgOperacion: number };
  dias: number;
  pares: Array<{
    clave: string;
    reciclador: string;
    negocio: string;
    operacionesEn7Dias: number;
    operacionesEnPeriodo: number;
    ultima: string;
    operaciones: Array<{ fecha: string; kg: number; material: string }>;
  }>;
  pesos: Array<{
    clave: string;
    operacionId: string;
    reciclador: string;
    negocio: string;
    material: string;
    kgPublicados: number;
    kgRecibidos: number;
    desvioPct: number;
    publicadaEn: string;
    completadaEn: string;
  }>;
};

const ROL: Record<string, string> = {
  RECICLADOR: 'Reciclador',
  CENTRO: 'Centro de acopio',
  COMPRADOR_MOVIL: 'Comprador móvil',
};
const ACCION: Record<Accion, { boton: string; titulo: string; explicacion: string; peligro: boolean }> = {
  PEDIR_CORRECCION: {
    boton: 'Pedir corrección al negocio',
    titulo: 'Pedir corrección',
    explicacion: 'El negocio verá el motivo, el plazo y qué hacer. No se modifica ningún precio.',
    peligro: false,
  },
  RESOLVER: {
    boton: 'Dar por resuelto',
    titulo: 'Dar por resuelto',
    explicacion: 'Se avisa a quien reportó.',
    peligro: false,
  },
  DESCARTAR: {
    boton: 'Descartar con motivo',
    titulo: 'Descartar',
    explicacion: 'Se avisa a quien reportó.',
    peligro: false,
  },
  OCULTAR_RESENA: {
    boton: 'Ocultar la reseña',
    titulo: 'Ocultar la reseña',
    explicacion:
      'Solo si rompe las reglas: insultos, datos personales o falsedad evidente. No se borra ni se edita su texto; deja de mostrarse y de contar en el promedio. El autor recibe un aviso.',
    peligro: true,
  },
};

function DetalleReporte({ reporte, alDecidir }: { reporte: Reporte; alDecidir: (accion: Accion) => void }) {
  const filas: Array<[string, string]> = [
    [
      'Sobre',
      reporte.negocio
        ? `${reporte.negocio.nombre}${reporte.material ? ` · ${reporte.material.nombre}` : ''}`
        : (reporte.resena?.destino ?? '—'),
    ],
    ['Enviado por', `${reporte.autor.nombre} · ${ROL[reporte.autor.rol] ?? reporte.autor.rol}`],
    ['Cuándo', formatearFechaHora(reporte.creadoEn)],
  ];
  if (reporte.precioVisto) filas.push(['Precio que vio', `S/ ${reporte.precioVisto} por kg`]);
  if (reporte.plazoHasta)
    filas.push(['Plazo', `${formatearFechaHora(reporte.plazoHasta)}${reporte.plazoVencido ? ' · vencido' : ''}`]);
  return (
    <>
      <div className="panel" data-detalle-reporte={reporte.id}>
        <div className="row sp wr">
          <div>
            <span className="kick">{reporte.tipo === 'RESENA' ? 'Reseña reportada' : 'Información incorrecta'}</span>
            <h2 style={{ display: 'block', margin: '6px 0 0', font: '800 26px var(--head)' }}>
              {TEXTO_MOTIVO_REPORTE[reporte.motivo]}
            </h2>
          </div>
          <PildoraReporte estado={reporte.estado} />
        </div>
        <hr className="divl" />
        <div className="list" style={{ gap: 0, fontSize: 14.5 }}>
          {filas.map(([etiqueta, valor]) => (
            <div
              key={etiqueta}
              className="row sp"
              style={{ padding: '9px 0', borderBottom: '1.5px solid var(--line)' }}
            >
              <span className="mini">{etiqueta}</span>
              <b style={{ textAlign: 'right' }}>{valor}</b>
            </div>
          ))}
        </div>
        {reporte.detalle && (
          <div
            style={{
              marginTop: 14,
              background: '#FFFDF7',
              border: '1.5px dashed var(--line)',
              borderRadius: 14,
              padding: '12px 14px',
            }}
          >
            <span className="mini">Lo que cuenta</span>
            <p style={{ margin: '4px 0 0' }}>{reporte.detalle}</p>
          </div>
        )}
        {reporte.resena && (
          <div
            style={{ marginTop: 14, border: '2px solid var(--ink)', borderRadius: 14, padding: '12px 14px' }}
            data-resena-reportada
          >
            <div className="row sp wr">
              <b>{reporte.resena.autor}</b>
              <span className="mini">{formatearFecha(reporte.resena.creadaEn)}</span>
            </div>
            <Estrellas valor={reporte.resena.estrellas} />
            {reporte.resena.etiquetas.length > 0 && <div className="mini">{reporte.resena.etiquetas.join(' · ')}</div>}
            <p style={{ margin: '6px 0 0' }}>{reporte.resena.comentario ?? <i className="mini">Sin comentario</i>}</p>
            <div className="mini" style={{ marginTop: 6 }}>
              Reportada {reporte.resena.reportes} {reporte.resena.reportes === 1 ? 'vez' : 'veces'}
              {reporte.resena.oculta && ` · oculta: ${reporte.resena.oculta.motivo}`}
            </div>
          </div>
        )}
        {reporte.decision && (
          <div className="note" style={{ marginTop: 12 }}>
            <Icono nombre="i-check" />
            <span>
              <b>Decisión:</b> {reporte.decision}
            </span>
          </div>
        )}
      </div>
      {reporte.acciones.length > 0 && (
        <div className="panel">
          <h3>Decisión</h3>
          <div className="row wr g8">
            {reporte.acciones.map((accion) => (
              <button
                key={accion}
                type="button"
                className={accion === 'OCULTAR_RESENA' ? 'btn dn' : accion === reporte.acciones[0] ? 'btn p' : 'btn'}
                onClick={() => alDecidir(accion)}
              >
                {ACCION[accion].boton}
              </button>
            ))}
            {reporte.tipo === 'NEGOCIO' && reporte.motivo === 'PRECIO' && (
              <Link className="btn ghost" href={RUTAS.adminPrecios}>
                Ir a moderación de precios
              </Link>
            )}
          </div>
          <p className="mini" style={{ marginTop: 10 }}>
            Sin botón de editar precios ni reseñas, a propósito. Cada decisión queda en el registro de auditoría.
          </p>
        </div>
      )}
    </>
  );
}

function PanelAlertas() {
  const aviso = useAviso();
  const [datos, setDatos] = useState<Alertas | null>(null);
  const [dias, setDias] = useState(30);
  const [version, setVersion] = useState(0);
  const [descartando, setDescartando] = useState<{ tipo: 'PAR' | 'PESO'; clave: string; titulo: string } | null>(null);
  useEffect(() => {
    let vigente = true;
    pedir<Alertas>(`/admin/alertas?dias=${dias}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [dias, version]);
  if (!datos) return <span className="girando" aria-label="Cargando" />;
  const descartar = async ({ motivo }: { motivo: string }) => {
    if (!descartando) return;
    await pedir('/admin/alertas/descartar', { cuerpo: { tipo: descartando.tipo, clave: descartando.clave, motivo } });
    aviso('Alerta descartada. Quedó en la auditoría.');
    setDescartando(null);
    setVersion((v) => v + 1);
  };
  return (
    <div className="stack" data-alertas>
      <div className="note">
        <Icono nombre="i-info" />
        <span>
          Señales para revisar, nunca un bloqueo automático: {datos.umbrales.operacionesPar} o más operaciones del mismo
          par en 7 días, o kilos <b>recibidos mayores</b> que los publicados en {datos.umbrales.desvioPct} % o más, o{' '}
          {datos.umbrales.kgOperacion} kg o más en una operación. Un peso recibido menor es un tema de calidad y se
          revisa en incidencias.
        </span>
      </div>
      <div className="seg" role="group" aria-label="Período">
        {[30, 60, 90].map((d) => (
          <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}>
            {d} días
          </button>
        ))}
      </div>
      <div className="panel">
        <h3>Pares reciclador–negocio repetidos</h3>
        {datos.pares.length === 0 ? (
          <p className="mini">Sin alertas en el período.</p>
        ) : (
          <div className="list" style={{ gap: 12 }}>
            {datos.pares.map((p) => (
              <div
                key={p.clave}
                data-alerta-par={p.clave}
                style={{ border: '2px solid var(--ink)', borderRadius: 14, padding: '12px 14px' }}
              >
                <div className="row sp wr">
                  <b>
                    {p.reciclador} con {p.negocio}
                  </b>
                  <span className="pill warn">{p.operacionesEn7Dias} operaciones en 7 días</span>
                </div>
                <div className="mini" style={{ margin: '6px 0' }}>
                  {p.operacionesEnPeriodo} en el período · última {formatearFecha(p.ultima)}
                </div>
                <div className="list" style={{ gap: 2, fontSize: 13.5 }}>
                  {p.operaciones.map((o) => (
                    <div key={o.fecha} className="row sp">
                      <span>
                        {formatearFecha(o.fecha)} · {o.material}
                      </span>
                      <span className="mono">{kilos(o.kg)} kg</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginTop: 10 }}
                  onClick={() =>
                    setDescartando({ tipo: 'PAR', clave: p.clave, titulo: `${p.reciclador} con ${p.negocio}` })
                  }
                >
                  Descartar con motivo
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="panel">
        <h3>Pesos atípicos: recibido mayor que publicado</h3>
        {datos.pesos.length === 0 ? (
          <p className="mini">Sin alertas en el período.</p>
        ) : (
          <div style={{ overflowX: 'auto', position: 'relative' }}>
            <table className="tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Operación</th>
                  <th>Publicados</th>
                  <th>Recibidos</th>
                  <th>Diferencia</th>
                  <th>Fechas</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.pesos.map((p) => (
                  <tr key={p.clave} data-alerta-peso={p.clave}>
                    <td>
                      <b>{p.material}</b>
                      <div className="mini">
                        {p.reciclador} con {p.negocio}
                      </div>
                    </td>
                    <td className="mono">{kilos(p.kgPublicados)} kg</td>
                    <td className="mono">{kilos(p.kgRecibidos)} kg</td>
                    <td className="mono">{p.desvioPct > 0 ? `+${p.desvioPct}` : p.desvioPct} %</td>
                    <td className="mini">
                      Publicó {formatearFecha(p.publicadaEn)}
                      <br />
                      Cerró {formatearFecha(p.completadaEn)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() =>
                          setDescartando({
                            tipo: 'PESO',
                            clave: p.clave,
                            titulo: `${p.material} · ${p.reciclador} con ${p.negocio}`,
                          })
                        }
                      >
                        Descartar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <DialogoDecision
        abierta={descartando !== null}
        antetitulo="— DESCARTAR ALERTA"
        titulo={descartando?.titulo ?? ''}
        explicacion="No cambia ninguna operación ni bloquea a nadie. Queda el motivo en la auditoría; un par vuelve a alertar si hay operaciones nuevas."
        boton="Descartar alerta"
        alCerrar={() => setDescartando(null)}
        alConfirmar={descartar}
      />
    </div>
  );
}

// Pantalla 60: el administrador decide con motivo; nunca edita precios, pesos ni el texto de una reseña
function Contenido() {
  const aviso = useAviso();
  const router = useRouter();
  const parametros = useSearchParams();
  const pestana = (
    ['NEGOCIO', 'RESENA', 'ALERTAS'].includes(parametros.get('tipo') ?? '') ? parametros.get('tipo') : 'NEGOCIO'
  ) as Pestana;
  const [estado, setEstado] = useState<Estado>('pendientes');
  const [lista, setLista] = useState<Lista | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [decision, setDecision] = useState<Accion | null>(null);
  const [version, setVersion] = useState(0);
  const tipo = pestana === 'ALERTAS' ? 'NEGOCIO' : pestana;

  useEffect(() => {
    let vigente = true;
    pedir<Lista>(`/admin/reportes?tipo=${tipo}&estado=${estado}`)
      .then((respuesta) => vigente && setLista(respuesta))
      .catch(() => vigente && setLista(null));
    return () => {
      vigente = false;
    };
  }, [tipo, estado, version]);

  const actual = lista?.datos.find((r) => r.id === elegido) ?? lista?.datos[0] ?? null;
  const decidir = async (datos: { motivo: string; plazoHoras?: number }) => {
    if (!actual || !decision) return;
    const ruta = {
      PEDIR_CORRECCION: 'pedir-correccion',
      RESOLVER: 'resolver',
      DESCARTAR: 'descartar',
      OCULTAR_RESENA: 'ocultar-resena',
    }[decision];
    await pedir(`/admin/reportes/${actual.id}/${ruta}`, { cuerpo: datos });
    aviso(
      decision === 'OCULTAR_RESENA'
        ? 'Reseña oculta. Quedó en la auditoría.'
        : 'Decisión registrada. No se modificó ningún precio.',
    );
    setDecision(null);
    setVersion((v) => v + 1);
  };

  const cuenta = (t: 'NEGOCIO' | 'RESENA', e: Estado) => lista?.conteos[t][e] ?? 0;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Reportes de"
        resaltado="usuarios"
        descripcion="Avisos de información incorrecta y reseñas reportadas. Resuelve con motivo; nunca edites precios."
        acciones={
          <Link className="btn" href={RUTAS.adminIncidencias}>
            Incidencias de operaciones {lista ? `(${lista.conteos.OPERACION.abiertas})` : ''}
          </Link>
        }
      />
      <div className="grid4" style={{ marginBottom: 24 }}>
        <Kpi
          etiqueta="Pendientes"
          valor={lista ? cuenta('NEGOCIO', 'pendientes') + cuenta('RESENA', 'pendientes') : '—'}
          detalle="sin revisar"
          icono="i-alert"
          fondo="sky"
        />
        <Kpi
          etiqueta="En revisión"
          valor={lista ? cuenta('NEGOCIO', 'en-revision') + cuenta('RESENA', 'en-revision') : '—'}
          detalle="en seguimiento"
          icono="i-clock"
          fondo="sand"
        />
        <Kpi
          etiqueta="Plazos vencidos"
          valor={lista?.plazosVencidos ?? '—'}
          detalle="decide qué hacer"
          icono="i-shield"
          fondo="mint"
        />
        <Kpi
          etiqueta="De operaciones"
          valor={lista?.conteos.OPERACION.abiertas ?? '—'}
          detalle="incidencias abiertas"
          icono="i-truck"
          fondo="lilac"
        />
      </div>
      <div className="seg" role="group" aria-label="Tipo de reporte" style={{ marginBottom: 16 }}>
        {(
          [
            ['NEGOCIO', 'Sobre negocios'],
            ['RESENA', 'Sobre reseñas'],
            ['ALERTAS', 'Posible colusión'],
          ] as Array<[Pestana, string]>
        ).map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            aria-pressed={pestana === clave}
            onClick={() => {
              setElegido(null);
              router.replace(`${RUTAS.adminReportes}?tipo=${clave}`);
            }}
          >
            {texto}
          </button>
        ))}
      </div>
      {pestana === 'ALERTAS' ? (
        <PanelAlertas />
      ) : (
        <div className="cols l">
          <section className="stack">
            <div className="seg" role="group" aria-label="Estado" style={{ width: '100%', gridAutoColumns: '1fr' }}>
              {(
                [
                  ['pendientes', 'Pendientes'],
                  ['en-revision', 'En revisión'],
                  ['cerrados', 'Cerrados'],
                ] as Array<[Estado, string]>
              ).map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  aria-pressed={estado === clave}
                  onClick={() => {
                    setElegido(null);
                    setEstado(clave);
                  }}
                >
                  {texto} {lista ? cuenta(tipo, clave) : ''}
                </button>
              ))}
            </div>
            <div className="list">
              {lista === null && <span className="girando" aria-label="Cargando" />}
              {lista?.datos.length === 0 && <EstadoVacio titulo="Nada en esta lista" />}
              {lista?.datos.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="panel"
                  data-reporte={r.id}
                  onClick={() => setElegido(r.id)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: 14,
                    ...(actual?.id === r.id
                      ? { background: '#F3FAE6', boxShadow: '5px 5px 0 var(--g)' }
                      : { boxShadow: '3px 3px 0 var(--ink)' }),
                  }}
                >
                  <span className="row sp">
                    <PildoraReporte estado={r.estado} />
                    <span className="mini">{formatearHace(r.creadoEn)}</span>
                  </span>
                  <b style={{ font: '700 15px var(--head)', display: 'block', marginTop: 6 }}>
                    {TEXTO_MOTIVO_REPORTE[r.motivo]}
                  </b>
                  <span className="mini">
                    {r.negocio?.nombre ?? r.resena?.destino}
                    {r.plazoVencido && ' · plazo vencido'}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="stack">
            {actual ? (
              <DetalleReporte reporte={actual} alDecidir={setDecision} />
            ) : (
              <EstadoVacio titulo="Elige un reporte" />
            )}
          </section>
        </div>
      )}
      <DialogoDecision
        abierta={decision !== null}
        antetitulo={decision ? `— ${ACCION[decision].titulo.toUpperCase()}` : ''}
        titulo={
          actual
            ? `${TEXTO_MOTIVO_REPORTE[actual.motivo]} · ${actual.negocio?.nombre ?? actual.resena?.destino ?? ''}`
            : ''
        }
        explicacion={decision ? ACCION[decision].explicacion : undefined}
        boton={decision ? ACCION[decision].boton : 'Confirmar'}
        peligro={decision ? ACCION[decision].peligro : false}
        plazos={decision === 'PEDIR_CORRECCION' ? PLAZOS_REPORTES : undefined}
        alCerrar={() => setDecision(null)}
        alConfirmar={decidir}
      />
    </>
  );
}

export function ReportesAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
