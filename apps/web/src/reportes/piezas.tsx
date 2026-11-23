'use client';

import { PLAZOS_CORRECCION_HORAS } from '@reciclomap/shared';
import { useId, useState } from 'react';
import { Ventana } from '@/diseno/avisos';
import { ErrorApi } from '@/sesion/api';

const ESTADO: Record<string, [string, string]> = {
  PENDIENTE: ['warn', 'En revisión'],
  EN_REVISION: ['blue', 'En revisión'],
  CORRECCION_PEDIDA: ['closed', 'Corrección pedida'],
  RESUELTO: ['open', 'Resuelto'],
  DESCARTADO: ['grey', 'Descartado'],
};

export function PildoraReporte({ estado }: { estado: string }) {
  const [tono, texto] = ESTADO[estado] ?? ['grey', estado];
  return (
    <span className={`pill ${tono}`} data-estado-reporte={estado}>
      <i />
      {texto}
    </span>
  );
}

export const TEXTO_PLAZO: Record<number, string> = { 24: '24 horas', 48: '48 horas', 72: '3 días', 168: '7 días' };

// Toda decisión del administrador pide motivo (se registra en la auditoría); algunas, además, un plazo
export function DialogoDecision({
  abierta,
  antetitulo,
  titulo,
  explicacion,
  boton,
  peligro = false,
  plazos,
  alCerrar,
  alConfirmar,
}: {
  abierta: boolean;
  antetitulo: string;
  titulo: string;
  explicacion?: string;
  boton: string;
  peligro?: boolean;
  plazos?: readonly number[];
  alCerrar: () => void;
  alConfirmar: (datos: { motivo: string; plazoHoras?: number }) => Promise<void>;
}) {
  const idMotivo = useId();
  const idPlazo = useId();
  const [motivo, setMotivo] = useState('');
  const [plazo, setPlazo] = useState('');
  const [errores, setErrores] = useState<{ motivo?: string; plazo?: string; general?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const confirmar = async () => {
    const nuevos = {
      motivo: motivo.trim().length < 5 ? 'Escribe el motivo (se registra).' : undefined,
      plazo: plazos && !plazo ? 'Elige un plazo.' : undefined,
    };
    setErrores(nuevos);
    if (nuevos.motivo || nuevos.plazo) return;
    setEnviando(true);
    try {
      await alConfirmar({ motivo: motivo.trim(), ...(plazos ? { plazoHoras: Number(plazo) } : {}) });
      setMotivo('');
      setPlazo('');
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos registrar la decisión.' });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana abierta={abierta} alCerrar={alCerrar} antetitulo={antetitulo} titulo={titulo}>
      {explicacion && <p className="mini">{explicacion}</p>}
      {plazos && (
        <div className={errores.plazo ? 'field err' : 'field'}>
          <label htmlFor={idPlazo}>Plazo para corregir</label>
          <div className="inp">
            <select id={idPlazo} value={plazo} onChange={(e) => setPlazo(e.target.value)}>
              <option value="">Elige un plazo</option>
              {plazos.map((horas) => (
                <option key={horas} value={horas}>
                  {TEXTO_PLAZO[horas] ?? `${horas} horas`}
                </option>
              ))}
            </select>
          </div>
          {errores.plazo && <span className="msg">{errores.plazo}</span>}
        </div>
      )}
      <div className={errores.motivo ? 'field err' : 'field'}>
        <label htmlFor={idMotivo}>
          Motivo <span className="opt">(obligatorio, se registra)</span>
        </label>
        <div className="inp ta">
          <textarea id={idMotivo} rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        {errores.motivo && <span className="msg">{errores.motivo}</span>}
      </div>
      {errores.general && (
        <div className="note warn" role="alert">
          {errores.general}
        </div>
      )}
      <button
        type="button"
        className={peligro ? 'btn dn' : 'btn p'}
        disabled={enviando}
        onClick={() => void confirmar()}
      >
        {enviando ? 'Registrando…' : boton}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}

export const PLAZOS_REPORTES = PLAZOS_CORRECCION_HORAS.filter((h) => h !== 72);
export const PLAZOS_PRECIOS = PLAZOS_CORRECCION_HORAS.filter((h) => h !== 48);
