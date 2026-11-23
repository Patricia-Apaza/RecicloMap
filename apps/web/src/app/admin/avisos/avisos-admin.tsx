'use client';

import {
  esquemaModerarAviso,
  formatearFecha,
  formatearHace,
  TEXTO_TIPO_AVISO,
  type TipoAviso,
} from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type AvisoFila = {
  id: string;
  negocio: { id: string; nombre: string; tipo: string };
  tipo: TipoAviso;
  titulo: string;
  mensaje: string | null;
  vigenteHasta: string;
  creadoEn: string;
  retirado: boolean;
  estado: 'ACTIVO' | 'OCULTO';
  vigente: boolean;
  motivoOculto: string | null;
  ocultoEn: string | null;
  ocultoPor: string | null;
};
type Respuesta = {
  resumen: { activos: number; ocultos: number };
  total: number;
  pagina: number;
  porPagina: number;
  datos: AvisoFila[];
};

function Decision({
  aviso,
  modo,
  alCerrar,
  alResolver,
}: {
  aviso: AvisoFila;
  modo: 'ocultar' | 'restituir';
  alCerrar: () => void;
  alResolver: () => void;
}) {
  const notificar = useAviso();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ocultar = modo === 'ocultar';
  const confirmar = async () => {
    const lectura = esquemaModerarAviso.safeParse({ motivo, confirmar: true });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Escribe el motivo.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/admin/avisos/${aviso.id}/${modo}`, { cuerpo: lectura.data });
      notificar(ocultar ? 'Aviso oculto' : 'Aviso restituido');
      alResolver();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana
      abierta
      alCerrar={alCerrar}
      antetitulo={ocultar ? 'OCULTAR AVISO' : 'RESTITUIR AVISO'}
      titulo={`${aviso.titulo} · ${aviso.negocio.nombre}`}
    >
      <p className="mini">
        {ocultar
          ? 'El aviso deja de verse. No se edita: el negocio recibe el motivo y puede crear uno nuevo sin precios, teléfonos ni enlaces.'
          : 'El aviso vuelve a verse en la ficha del negocio. El negocio recibe un aviso.'}
      </p>
      <Campo
        etiqueta="Motivo (se registra)"
        maxLength={200}
        value={motivo}
        onChange={(e) => {
          setMotivo(e.target.value);
          setError(null);
        }}
        error={error ?? undefined}
      />
      <div className="row g8 wr">
        <button
          type="button"
          className={ocultar ? 'btn dn' : 'btn p'}
          disabled={enviando}
          onClick={() => void confirmar()}
        >
          {ocultar ? 'Confirmar y ocultar' : 'Confirmar y restituir'}
        </button>
        <button type="button" className="btn" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Ventana>
  );
}

function Contenido() {
  const [estado, setEstado] = useState<'activos' | 'ocultos' | 'todos'>('activos');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [version, setVersion] = useState(0);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [accion, setAccion] = useState<{ aviso: AvisoFila; modo: 'ocultar' | 'restituir' } | null>(null);

  useEffect(() => {
    let vigente = true;
    const consulta = new URLSearchParams({ estado, pagina: String(pagina) });
    if (q.trim()) consulta.set('q', q.trim());
    pedir<Respuesta>(`/admin/avisos?${consulta.toString()}`)
      .then((r) => vigente && setDatos(r))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [estado, q, pagina, version]);

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Avisos de"
        resaltado="negocios"
        descripcion="Puedes ocultar un aviso con motivo y restituirlo. No puedes editarlo."
      />
      <div className="grid3" style={{ marginBottom: 24 }} data-kpis>
        <Kpi etiqueta="Activos" icono="i-bell" valor={datos?.resumen.activos ?? '—'} detalle="Visibles hoy" />
        <Kpi etiqueta="Ocultos" icono="i-alert" valor={datos?.resumen.ocultos ?? '—'} detalle="Con motivo registrado" />
      </div>
      <section className="panel">
        <div className="row sp wr" style={{ marginBottom: 16, gap: 12 }}>
          <div className="seg" role="group" aria-label="Estado">
            {(['activos', 'ocultos', 'todos'] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={estado === e}
                onClick={() => {
                  setEstado(e);
                  setPagina(1);
                }}
              >
                {e === 'activos' ? 'Activos' : e === 'ocultos' ? 'Ocultos' : 'Todos'}
              </button>
            ))}
          </div>
          <div className="inp" style={{ height: 42 }}>
            <input
              aria-label="Buscar aviso"
              placeholder="Título o negocio"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
        {!datos && <span className="girando" role="status" aria-label="Cargando" />}
        {datos && datos.datos.length === 0 && <EstadoVacio icono="i-check" titulo="Sin avisos aquí" />}
        <div className="list">
          {datos?.datos.map((a) => (
            <div
              key={a.id}
              data-aviso={a.titulo}
              data-estado={a.estado}
              className="row g16 wr"
              style={{ border: '2px solid var(--ink)', borderRadius: 16, padding: '12px 14px' }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="row g8 wr">
                  <b style={{ font: '800 16px var(--head)' }}>{a.titulo}</b>
                  <span className="pill blue">{TEXTO_TIPO_AVISO[a.tipo]}</span>
                  {a.estado === 'OCULTO' && <span className="pill closed">Oculto</span>}
                  {a.retirado && <span className="pill grey">Retirado por el negocio</span>}
                </div>
                <div className="mini">
                  {a.negocio.nombre} · publicado {formatearHace(a.creadoEn)} · hasta{' '}
                  {formatearFecha(`${a.vigenteHasta}T12:00:00Z`)}
                </div>
                {a.mensaje && <div style={{ marginTop: 4, fontSize: 14 }}>{a.mensaje}</div>}
                {a.estado === 'OCULTO' && (
                  <div className="mini" style={{ marginTop: 4 }}>
                    Oculto{a.ocultoPor ? ` por ${a.ocultoPor}` : ''}. Motivo: {a.motivoOculto}
                  </div>
                )}
              </div>
              {a.estado === 'ACTIVO' && !a.retirado && (
                <button type="button" className="btn sm dn" onClick={() => setAccion({ aviso: a, modo: 'ocultar' })}>
                  Ocultar
                </button>
              )}
              {a.estado === 'OCULTO' && (
                <button type="button" className="btn sm" onClick={() => setAccion({ aviso: a, modo: 'restituir' })}>
                  Restituir
                </button>
              )}
            </div>
          ))}
        </div>
        {datos && (
          <div className="row sp wr" style={{ marginTop: 12 }}>
            <p className="mini" style={{ margin: 0 }}>
              {datos.total} {datos.total === 1 ? 'aviso' : 'avisos'} · página {pagina} de {paginas}
            </p>
            <div className="row g8">
              <button type="button" className="btn sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
      {accion && (
        <Decision
          aviso={accion.aviso}
          modo={accion.modo}
          alCerrar={() => setAccion(null)}
          alResolver={() => {
            setAccion(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

export function AvisosAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="dash">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
