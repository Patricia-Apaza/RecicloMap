'use client';

import {
  type CodigoMaterial,
  esquemaResolverIncidencia,
  type EstadoOperacion,
  formatearFechaHora,
} from '@reciclomap/shared';
import { useCallback, useEffect, useId, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import { PildoraOperacion } from '@/operaciones/piezas';
import { FichaMaterial, kilos, soles } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Decision = 'PEDIR_CORRECCION' | 'CERRAR_CON_KILOS_VIGENTES' | 'ANULAR';
type Incidencia = {
  id: string;
  estado: string;
  motivo: string;
  detalle: string | null;
  decision: Decision | null;
  resolucion: string | null;
  abiertaEn: string;
  resueltaEn: string | null;
  operacion: {
    id: string;
    estado: EstadoOperacion;
    enDisputa: boolean;
    material: { codigo: CodigoMaterial; nombre: string };
    kgPublicados: number;
    kgConfirmados: number | null;
    montoFinal: string | null;
    precioKg: string;
    reciclador: string;
    negocio: string;
    entregadaEn: string | null;
    confirmadaEn: string | null;
  };
  decisiones: Decision[];
};

const TEXTO_DECISION: Record<Decision, { boton: string; explicacion: string; peligro: boolean }> = {
  PEDIR_CORRECCION: {
    boton: 'Pedir corrección de kilos',
    explicacion:
      'El negocio tendrá 72 horas para volver a pesar y escribir los kilos recibidos. El reciclador los revisará otra vez.',
    peligro: false,
  },
  CERRAR_CON_KILOS_VIGENTES: {
    boton: 'Cerrar con los kilos actuales',
    explicacion: 'La operación se completa con los kilos que confirmó el negocio. El reciclador recibe sus puntos.',
    peligro: false,
  },
  ANULAR: {
    boton: 'Anular sin puntos',
    explicacion: 'La operación se cancela. Nadie recibe puntos y no se podrá calificar.',
    peligro: true,
  },
};

// Resolución mínima (S4): el administrador decide, nunca escribe pesos, montos ni reseñas; todo queda auditado
function Contenido() {
  const aviso = useAviso();
  const id = useId();
  const [vista, setVista] = useState<'abiertas' | 'resueltas'>('abiertas');
  const [lista, setLista] = useState<Incidencia[] | null>(null);
  const [elegida, setElegida] = useState<{ incidencia: Incidencia; decision: Decision } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async (elegido: 'abiertas' | 'resueltas') => {
    setLista((await pedir<{ datos: Incidencia[] }>(`/admin/incidencias?estado=${elegido}`)).datos);
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<{ datos: Incidencia[] }>(`/admin/incidencias?estado=${vista}`)
      .then((respuesta) => vigente && setLista(respuesta.datos))
      .catch(() => vigente && setLista([]));
    return () => {
      vigente = false;
    };
  }, [vista]);

  const resolver = async () => {
    if (!elegida) return;
    const lectura = esquemaResolverIncidencia.safeParse({ decision: elegida.decision, motivo });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Explica la decisión.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/admin/incidencias/${elegida.incidencia.id}/resolver`, { cuerpo: lectura.data });
      aviso('Decisión registrada. Ambas partes fueron notificadas.');
      setElegida(null);
      setMotivo('');
      await cargar(vista);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos registrar la decisión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Incidencias de"
        resaltado="operaciones"
        descripcion="No conformidades y problemas reportados. Detienen el plazo de cierre hasta que decidas. No puedes cambiar pesos ni montos."
      />
      <div className="seg" role="group" aria-label="Mostrar" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={vista === 'abiertas'} onClick={() => setVista('abiertas')}>
          Abiertas
        </button>
        <button type="button" aria-pressed={vista === 'resueltas'} onClick={() => setVista('resueltas')}>
          Resueltas
        </button>
      </div>
      <div className="list">
        {lista === null && <span className="girando" aria-label="Cargando" />}
        {lista?.length === 0 && (
          <EstadoVacio
            icono="i-shield"
            titulo={vista === 'abiertas' ? 'No hay incidencias abiertas' : 'Aún no hay incidencias resueltas'}
          />
        )}
        {lista?.map((inc) => {
          const op = inc.operacion;
          return (
            <article key={inc.id} className="panel" data-incidencia={inc.id} style={{ padding: 16 }}>
              <div className="row g16 wr" style={{ alignItems: 'flex-start' }}>
                <FichaMaterial codigo={op.material.codigo} tamano={44} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="row sp wr" style={{ gap: 8 }}>
                    <b style={{ font: '700 17px var(--head)' }}>
                      {op.material.nombre} · {op.reciclador} con {op.negocio}
                    </b>
                    <PildoraOperacion estado={op.estado} enDisputa={op.enDisputa} />
                  </div>
                  <div className="mini">
                    Abierta {formatearFechaHora(inc.abiertaEn)} ·{' '}
                    {inc.estado === 'CORRECCION_PEDIDA' ? 'Corrección pedida' : inc.estado.toLowerCase()}
                  </div>
                  <p style={{ margin: '8px 0 0' }}>
                    <b>{inc.motivo}</b>
                    {inc.detalle && <> — {inc.detalle}</>}
                  </p>
                  <div className="row wr g16 mini" style={{ marginTop: 8 }}>
                    <span>Publicados: {kilos(op.kgPublicados)} kg</span>
                    <span>
                      Confirmados por el negocio:{' '}
                      {op.kgConfirmados === null ? 'aún no' : `${kilos(op.kgConfirmados)} kg`}
                    </span>
                    <span>Precio: {soles(op.precioKg)} / kg</span>
                    {op.montoFinal && <span>Monto informativo: {soles(op.montoFinal)}</span>}
                  </div>
                  {inc.resolucion && (
                    <p className="mini" style={{ marginTop: 8 }}>
                      Resolución: {inc.resolucion}
                    </p>
                  )}
                </div>
              </div>
              {inc.decisiones.length > 0 && (
                <div className="row g8 wr" style={{ marginTop: 12 }}>
                  {inc.decisiones.map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      className={TEXTO_DECISION[decision].peligro ? 'btn sm dn' : 'btn sm'}
                      onClick={() => {
                        setElegida({ incidencia: inc, decision });
                        setError(null);
                      }}
                    >
                      {TEXTO_DECISION[decision].boton}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <Ventana
        abierta={elegida !== null}
        alCerrar={() => setElegida(null)}
        antetitulo="RESOLVER INCIDENCIA"
        titulo={elegida ? TEXTO_DECISION[elegida.decision].boton : ''}
      >
        {elegida && <p className="mini">{TEXTO_DECISION[elegida.decision].explicacion}</p>}
        <div className={error ? 'field err' : 'field'}>
          <label htmlFor={id}>Motivo de la decisión</label>
          <div className="inp ta">
            <textarea id={id} rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {error && (
            <span className="msg" role="alert">
              {error}
            </span>
          )}
        </div>
        <button
          type="button"
          className={elegida && TEXTO_DECISION[elegida.decision].peligro ? 'btn dn' : 'btn p'}
          disabled={enviando}
          onClick={() => void resolver()}
        >
          {enviando ? 'Registrando…' : 'Confirmar decisión'}
        </button>
        <button type="button" className="btn ghost" onClick={() => setElegida(null)}>
          Volver
        </button>
      </Ventana>
    </>
  );
}

export function Incidencias() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
