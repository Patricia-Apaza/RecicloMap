'use client';

import {
  esquemaConfirmarRecepcion,
  type EstadoOperacion,
  formatearFechaHora,
  TEXTO_OPERACION,
} from '@reciclomap/shared';
import { useId, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { kilos, soles } from '@/publicaciones/piezas';
import type { Operacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';

const TONO: Record<EstadoOperacion, string> = {
  ACEPTADA: 'blue',
  EN_COORDINACION: 'warn',
  ENTREGADA: 'warn',
  CONFIRMADA: 'warn',
  COMPLETADA: 'open',
  CANCELADA: 'closed',
};

export function PildoraOperacion({ estado, enDisputa = false }: { estado: EstadoOperacion; enDisputa?: boolean }) {
  return (
    <span className={`pill ${enDisputa ? 'closed' : TONO[estado]}`} data-estado={estado}>
      <i />
      {enDisputa ? 'En revisión' : TEXTO_OPERACION[estado]}
    </span>
  );
}

// HU-10: 7 pasos; los dos primeros ya están cumplidos cuando existe la operación
const PASOS: Array<{
  clave: keyof Operacion['fechas'];
  estado: EstadoOperacion | null;
  texto: string;
  detalle: string;
}> = [
  { clave: 'publicada', estado: null, texto: 'Publicada', detalle: 'El material se publicó.' },
  { clave: 'ofertaRecibida', estado: null, texto: 'Oferta recibida', detalle: 'Llegó la oferta que se aceptó.' },
  {
    clave: 'aceptada',
    estado: 'ACEPTADA',
    texto: 'Aceptada',
    detalle: 'Se eligió la oferta y se compartió el WhatsApp.',
  },
  {
    clave: 'coordinada',
    estado: 'EN_COORDINACION',
    texto: 'En coordinación',
    detalle: 'El reciclador definió el punto de encuentro.',
  },
  { clave: 'entregada', estado: 'ENTREGADA', texto: 'Entregada', detalle: 'El reciclador entregó el material.' },
  {
    clave: 'confirmada',
    estado: 'CONFIRMADA',
    texto: 'Confirmada',
    detalle: 'El comprador confirmó los kilos recibidos.',
  },
  {
    clave: 'completada',
    estado: 'COMPLETADA',
    texto: 'Completada',
    detalle: 'Puntos sumados y calificaciones habilitadas.',
  },
];

// Línea de pasos de la pantalla 26, con la fecha de cada uno
export function LineaOperacion({ operacion }: { operacion: Operacion }) {
  const actual = PASOS.findIndex((p) => p.estado === operacion.estado);
  const cumplido = (indice: number, fecha: string | null) =>
    PASOS[indice]!.estado === null || (Boolean(fecha) && (indice < actual || operacion.estado === 'COMPLETADA'));
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Pasos de la operación">
      {PASOS.map((paso, indice) => {
        const fecha = operacion.fechas[paso.clave];
        const hecho = cumplido(indice, fecha);
        const ahora = indice === actual && operacion.estado !== 'COMPLETADA';
        return (
          <li
            key={paso.clave}
            className="row"
            style={{ alignItems: 'flex-start', gap: 16 }}
            data-paso={paso.estado ?? paso.clave}
            aria-current={ahora ? 'step' : undefined}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: '2px solid var(--ink)',
                  display: 'grid',
                  placeItems: 'center',
                  font: '600 13px var(--mono)',
                  background: hecho ? 'var(--btn)' : ahora ? 'var(--lime)' : '#fff',
                  color: hecho ? '#fff' : 'var(--ink)',
                  boxShadow: ahora ? '2px 2px 0 var(--ink)' : 'none',
                }}
                aria-hidden="true"
              >
                {hecho ? <Icono nombre="i-check" tamano="sm" /> : indice + 1}
              </span>
              {indice < PASOS.length - 1 && (
                <span
                  style={{ width: 2, height: 30, background: hecho ? 'var(--ink)' : 'rgba(18,48,31,.25)' }}
                  aria-hidden="true"
                />
              )}
            </div>
            <div style={{ paddingBottom: 14, opacity: hecho || ahora ? 1 : 0.55 }}>
              <b style={{ font: '700 16px var(--head)', color: 'var(--ink)' }}>{paso.texto}</b>
              <div className="mini">{fecha ? formatearFechaHora(fecha) : paso.detalle}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Motivo obligatorio (cancelar, no conforme, incidencia)
export function DialogoMotivo({
  abierto,
  antetitulo,
  titulo,
  explicacion,
  opciones,
  boton,
  peligro = false,
  campo = 'motivo',
  alCerrar,
  alEnviar,
}: {
  abierto: boolean;
  antetitulo: string;
  titulo: string;
  explicacion?: string;
  opciones?: readonly string[];
  boton: string;
  peligro?: boolean;
  campo?: 'motivo' | 'detalle';
  alCerrar: () => void;
  alEnviar: (cuerpo: Record<string, string>) => Promise<void>;
}) {
  const id = useId();
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const minimo = campo === 'motivo' ? 3 : 5;
  const enviar = async () => {
    if (valor.trim().length < minimo) {
      setError(opciones ? 'Elige un motivo.' : 'Cuéntanos qué pasó.');
      return;
    }
    setEnviando(true);
    try {
      await alEnviar({ [campo]: valor.trim() });
      setValor('');
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviarlo. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana abierta={abierto} alCerrar={alCerrar} antetitulo={antetitulo} titulo={titulo}>
      {explicacion && <p className="mini">{explicacion}</p>}
      <div className={error ? 'field err' : 'field'}>
        <label htmlFor={id}>{opciones ? 'Motivo' : 'Qué pasó'}</label>
        <div className={opciones ? 'inp' : 'inp ta'}>
          {opciones ? (
            <select id={id} value={valor} onChange={(e) => setValor(e.target.value)}>
              <option value="">Elige un motivo</option>
              {opciones.map((opcion) => (
                <option key={opcion}>{opcion}</option>
              ))}
            </select>
          ) : (
            <textarea id={id} rows={3} maxLength={300} value={valor} onChange={(e) => setValor(e.target.value)} />
          )}
        </div>
        {error && (
          <span className="msg" role="alert">
            {error}
          </span>
        )}
      </div>
      <button type="button" className={peligro ? 'btn dn' : 'btn p'} disabled={enviando} onClick={() => void enviar()}>
        {enviando ? 'Enviando…' : boton}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}

// "Recibí": los kilos recibidos son obligatorios y solo los escribe el comprador (C9)
export function DialogoRecibi({
  operacion,
  corrigiendo = false,
  alCerrar,
  alConfirmar,
}: {
  operacion: { id: string; material: { nombre: string }; kg: number; precioKg: string } | null;
  corrigiendo?: boolean;
  alCerrar: () => void;
  alConfirmar: () => void;
}) {
  const aviso = useAviso();
  const [kg, setKg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  if (!operacion) return null;
  const valor = Number(kg.replace(',', '.'));
  const monto = Number.isFinite(valor) && valor > 0 ? valor * Number(operacion.precioKg) : 0;
  const confirmar = async () => {
    const lectura = esquemaConfirmarRecepcion.safeParse({ kgRecibidos: kg });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Escribe los kilos recibidos.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/operaciones/${operacion.id}/confirmar`, { cuerpo: lectura.data });
      aviso(
        corrigiendo
          ? 'Kilos corregidos. El reciclador revisará de nuevo.'
          : 'Recepción confirmada. El reciclador revisará los kilos.',
      );
      alConfirmar();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos confirmar la recepción.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana
      abierta
      alCerrar={alCerrar}
      antetitulo={corrigiendo ? 'CORREGIR KILOS' : 'CONFIRMAR RECEPCIÓN'}
      titulo={
        corrigiendo
          ? '¿Cuántos kilos recibiste en realidad?'
          : `¿Recibiste el ${operacion.material.nombre.toLowerCase()}?`
      }
    >
      <p className="mini">
        Se publicaron {kilos(operacion.kg)} kg. Pesa el material y escribe los kilos que recibiste: el reciclador los
        revisará.
      </p>
      <Campo
        etiqueta="Kilos recibidos"
        sufijo="kg"
        inputMode="decimal"
        placeholder={String(operacion.kg)}
        value={kg}
        onChange={(e) => {
          setKg(e.target.value);
          setError(null);
        }}
        error={error ?? undefined}
      />
      <div
        style={{
          background: 'var(--paper)',
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span>Monto a pagar</span>
        <b className="mono" style={{ font: '600 20px var(--mono)' }} data-monto>
          {soles(monto)}
        </b>
      </div>
      <p className="mini">
        {soles(operacion.precioKg)} por kg acordado. Es un dato informativo: el pago lo hacen entre ustedes, fuera de
        RecicloMap.
      </p>
      <button type="button" className="btn p" disabled={enviando} onClick={() => void confirmar()}>
        {enviando ? 'Confirmando…' : corrigiendo ? 'Guardar kilos corregidos' : 'Sí, lo recibí'}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}
