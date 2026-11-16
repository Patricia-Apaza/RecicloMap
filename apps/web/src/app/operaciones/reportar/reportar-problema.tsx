'use client';

import {
  esquemaProblemaOperacion,
  formatearFecha,
  formatearHace,
  TEXTO_MOTIVO_REPORTE,
  TIPOS_PROBLEMA_OPERACION,
} from '@reciclomap/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { kilos } from '@/publicaciones/piezas';
import type { Historial } from '@/publicaciones/tipos';
import { PildoraReporte } from '@/reportes/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

type Tipo = (typeof TIPOS_PROBLEMA_OPERACION)[number];
type MiProblema = {
  id: string;
  motivo: string;
  estado: string;
  decision: string | null;
  creadoEn: string;
  operacion: { id: string; material: string; contraparte: string } | null;
};
const ICONO: Record<Tipo, NombreIcono> = {
  NO_LLEGO: 'i-clock',
  PESO: 'i-calc',
  PAGO: 'i-cash',
  TRATO: 'i-alert',
  OTRO: 'i-info',
};
const TEXTO_ESTADO_OPERACION: Record<string, string> = {
  ACEPTADA: 'aceptada',
  EN_COORDINACION: 'en coordinación',
  ENTREGADA: 'entregada',
  CONFIRMADA: 'confirmada',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada',
};

// Pantalla 29: llega a la administración como incidencia; desde aquí no se cancela ni se paga nada
function Contenido() {
  const aviso = useAviso();
  const parametros = useSearchParams();
  const { usuario } = useSesion();
  const reciclador = usuario?.rol === 'RECICLADOR';
  const [operacionId, setOperacionId] = useState(parametros.get('operacion') ?? '');
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [detalle, setDetalle] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [mios, setMios] = useState<MiProblema[]>([]);

  const cargarMios = useCallback(async () => {
    setMios((await pedir<{ datos: MiProblema[] }>('/operaciones/problemas/mios')).datos);
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<Historial>('/operaciones?estado=todas')
      .then((respuesta) => vigente && setHistorial(respuesta))
      .catch(() => undefined);
    pedir<{ datos: MiProblema[] }>('/operaciones/problemas/mios')
      .then((respuesta) => vigente && setMios(respuesta.datos))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const texto = (t: Tipo) =>
    t === 'NO_LLEGO'
      ? reciclador
        ? 'El comprador no llegó'
        : 'El reciclador no llegó'
      : t === 'PAGO' && reciclador
        ? 'Me pagó distinto a lo acordado'
        : TEXTO_MOTIVO_REPORTE[t];

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const lectura = esquemaProblemaOperacion.safeParse({ tipo: tipo ?? undefined, detalle });
    const nuevos: Record<string, string> = {};
    if (!operacionId) nuevos.operacion = 'Elige una operación.';
    if (!lectura.success) for (const p of lectura.error.issues) nuevos[String(p.path[0])] ??= p.message;
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !lectura.success) return;
    setEnviando(true);
    try {
      await pedir(`/operaciones/${operacionId}/problema`, { cuerpo: lectura.data });
      aviso('Reporte enviado. Un administrador lo revisará.');
      setTipo(null);
      setDetalle('');
      await cargarMios();
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos enviar tu reporte.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Algo salió mal"
        titulo="Cuéntanos qué"
        resaltado="pasó"
        descripcion="Un administrador revisa cada caso. No se cancelan ni se pagan operaciones desde aquí."
        acciones={
          <Link className="btn ghost" href={operacionId ? `/operaciones/${operacionId}` : RUTAS.historial}>
            <Icono nombre="i-arrow-left" />
            Volver
          </Link>
        }
      />
      <div className="cols">
        <form className="panel" onSubmit={(e) => void enviar(e)} noValidate>
          <h2>Detalle del problema</h2>
          <div className="stack" style={{ gap: 20 }}>
            <div className={errores.operacion ? 'field err' : 'field'}>
              <label htmlFor="operacion">¿Con qué operación?</label>
              <div className="inp">
                <select id="operacion" value={operacionId} onChange={(e) => setOperacionId(e.target.value)}>
                  <option value="">Elige una operación</option>
                  {historial?.datos.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.material.nombre} · {kilos(o.kg)} kg · {o.contraparte} ({TEXTO_ESTADO_OPERACION[o.estado]},{' '}
                      {formatearFecha(o.fecha)})
                    </option>
                  ))}
                </select>
              </div>
              {errores.operacion && <span className="msg">{errores.operacion}</span>}
            </div>
            <div className={errores.tipo ? 'field err' : 'field'}>
              <span className="lbl">¿Qué pasó?</span>
              <div className="grid2" role="group" aria-label="Qué pasó" style={{ gap: 12 }}>
                {TIPOS_PROBLEMA_OPERACION.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="opt-card"
                    aria-pressed={tipo === t}
                    onClick={() => setTipo(t)}
                  >
                    <span className="mi" style={{ background: 'var(--sand)' }}>
                      <Icono nombre={ICONO[t]} />
                    </span>
                    <b>{t === 'OTRO' ? 'Otro problema' : texto(t)}</b>
                  </button>
                ))}
              </div>
              {errores.tipo && <span className="msg">Elige una opción.</span>}
            </div>
            <div className={errores.detalle ? 'field err' : 'field'}>
              <label htmlFor="detalle">Cuéntanos con detalle</label>
              <div className="inp ta">
                <textarea
                  id="detalle"
                  rows={4}
                  maxLength={300}
                  placeholder="Qué acordaron, qué pasó y a qué hora."
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                />
              </div>
              <div className="row sp">
                {errores.detalle ? <span className="msg">{errores.detalle}</span> : <span />}
                <span className="hint mono">{detalle.length} / 300</span>
              </div>
            </div>
            {tipo === 'PESO' && reciclador && (
              <div className="note">
                <Icono nombre="i-info" />
                <span>
                  Si la operación espera tu conformidad, también puedes elegir «No conforme» en su seguimiento: así se
                  detiene el plazo de cierre.
                </span>
              </div>
            )}
            {errores.general && (
              <div className="note warn" role="alert">
                {errores.general}
              </div>
            )}
            <div className="row g8 wr">
              <button className="btn p" type="submit" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar reporte'}
              </button>
              <Link className="btn ghost" href={reciclador ? RUTAS.historial : RUTAS.historialCompras}>
                Cancelar
              </Link>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="panel">
            <h3>Qué hacemos con tu reporte</h3>
            <div className="list" style={{ gap: 10 }}>
              {[
                ['var(--sky)', 'Lo revisa un administrador.'],
                [
                  'var(--sand)',
                  reciclador ? 'Puede pedir su versión al comprador.' : 'Puede pedir su versión al reciclador.',
                ],
                ['var(--mint)', 'Te avisamos por notificación con el resultado.'],
              ].map(([fondo, linea], indice) => (
                <div key={linea} className="row g16" style={{ alignItems: 'flex-start' }}>
                  <span className="mi" style={{ background: fondo }}>
                    {indice + 1}
                  </span>
                  <span>{linea}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Tus reportes</h3>
            <div className="list" style={{ gap: 10 }} data-mis-problemas>
              {mios.length === 0 && <p className="mini">Todavía no enviaste ningún reporte.</p>}
              {mios.map((r) => (
                <div key={r.id} style={{ border: '2px solid var(--ink)', borderRadius: 14, padding: '10px 12px' }}>
                  <div className="row sp">
                    <PildoraReporte estado={r.estado} />
                    <span className="mini">{formatearHace(r.creadoEn)}</span>
                  </div>
                  <b style={{ font: '700 14px var(--head)', display: 'block', marginTop: 6 }}>
                    {TEXTO_MOTIVO_REPORTE[r.motivo]}
                  </b>
                  {r.operacion && (
                    <span className="mini">
                      {r.operacion.material} · {r.operacion.contraparte}
                    </span>
                  )}
                  {r.decision && (
                    <p className="mini" style={{ margin: '4px 0 0' }}>
                      Decisión: {r.decision}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export function ReportarProblema() {
  const { usuario } = useSesion();
  return (
    <Protegida roles={['RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa={usuario?.rol === 'RECICLADOR' ? 'his' : undefined}>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
