'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icono } from './icono';

const DURACION_MS = 3400;

type MostrarAviso = (mensaje: string) => void;

const ContextoAviso = createContext<MostrarAviso | null>(null);

// Aviso flotante: dice qué pasó, sin ventanas que bloqueen
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mostrar = useCallback<MostrarAviso>((texto) => {
    setMensaje(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setMensaje(null), DURACION_MS);
  }, []);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  return (
    <ContextoAviso.Provider value={mostrar}>
      {children}
      <div className={mensaje ? 'toast on' : 'toast'} role="status" aria-live="polite">
        {mensaje && (
          <>
            <Icono nombre="i-check" />
            {mensaje}
          </>
        )}
      </div>
    </ContextoAviso.Provider>
  );
}

export function useAviso(): MostrarAviso {
  const mostrar = useContext(ContextoAviso);
  if (!mostrar) {
    throw new Error('useAviso debe usarse dentro de ProveedorAvisos');
  }
  return mostrar;
}

export function Ventana({
  abierta,
  alCerrar,
  antetitulo,
  titulo,
  children,
}: {
  abierta: boolean;
  alCerrar: () => void;
  antetitulo?: string;
  titulo: string;
  children: ReactNode;
}) {
  const hoja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const anterior = document.activeElement as HTMLElement | null;
    hoja.current?.querySelector<HTMLElement>('button, a, input, select, textarea')?.focus();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      anterior?.focus();
    };
  }, [abierta, alCerrar]);

  if (!abierta) return null;
  return (
    <div
      className="ov"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titulo} ref={hoja}>
        {antetitulo && (
          <span className="mono" style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--deep)' }}>
            — {antetitulo}
          </span>
        )}
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}
