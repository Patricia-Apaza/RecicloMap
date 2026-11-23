'use client';

import { type ReactNode, useState } from 'react';
import { Ventana } from '@/diseno/avisos';
import { Campo } from '@/diseno/formulario';
import { ErrorApi } from '@/sesion/api';

type Propiedades = {
  antetitulo: string;
  titulo: string;
  texto?: ReactNode;
  textoBoton: string;
  peligro?: boolean;
  // Confirmación extra para lo que cambia el costo de los premios
  confirmacionExtra?: string;
  alCerrar: () => void;
  alConfirmar: (motivo: string, confirmacionExtra: boolean) => Promise<void>;
  children?: ReactNode;
};

// Toda acción de administración pide su motivo, que queda en la auditoría
export function VentanaMotivo({
  antetitulo,
  titulo,
  texto,
  textoBoton,
  peligro,
  confirmacionExtra,
  alCerrar,
  alConfirmar,
  children,
}: Propiedades) {
  const [motivo, setMotivo] = useState('');
  const [extra, setExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (motivo.trim().length < 5) {
      setError('Escribe el motivo (mínimo 5 letras).');
      return;
    }
    if (confirmacionExtra && !extra) {
      setError('Confirma que entiendes el efecto en el costo de los premios.');
      return;
    }
    setEnviando(true);
    try {
      await alConfirmar(motivo.trim(), extra);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana abierta alCerrar={alCerrar} antetitulo={antetitulo} titulo={titulo}>
      {texto && <p className="mini">{texto}</p>}
      {children}
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
      {confirmacionExtra && (
        <label className="row g8" style={{ margin: '8px 0' }}>
          <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
          <span style={{ fontSize: 14 }}>{confirmacionExtra}</span>
        </label>
      )}
      <div className="row g8 wr">
        <button
          type="button"
          className={peligro ? 'btn dn' : 'btn p'}
          disabled={enviando}
          onClick={() => void enviar()}
        >
          {textoBoton}
        </button>
        <button type="button" className="btn" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Ventana>
  );
}
