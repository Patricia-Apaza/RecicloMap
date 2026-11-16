'use client';

import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { clases } from './clases';
import { Icono } from './icono';

type PropiedadesCampo = {
  etiqueta: string;
  opcional?: boolean;
  ayuda?: string;
  error?: string;
  prefijo?: string;
  sufijo?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

export function Campo({ etiqueta, opcional, ayuda, error, prefijo, sufijo, className, ...entrada }: PropiedadesCampo) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descritoPor = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clases('field', error && 'err', className)}>
      <label htmlFor={id}>
        {etiqueta} {opcional && <span className="opt">(opcional)</span>}
      </label>
      <div className="inp">
        {prefijo && <span className="u">{prefijo}</span>}
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={descritoPor} {...entrada} />
        {sufijo && <span className="u">{sufijo}</span>}
      </div>
      {ayuda && !error && (
        <span className="hint" id={idAyuda}>
          {ayuda}
        </span>
      )}
      {error && (
        <span className="msg" id={idError}>
          <Icono nombre="i-alert" tamano="sm" />
          {error}
        </span>
      )}
    </div>
  );
}

export function Interruptor({
  etiqueta,
  marcado,
  alCambiar,
}: {
  etiqueta: string;
  marcado: boolean;
  alCambiar: (valor: boolean) => void;
}) {
  return (
    <label className="row g8" style={{ cursor: 'pointer' }}>
      <span className="sw">
        <input
          type="checkbox"
          role="switch"
          checked={marcado}
          onChange={(evento) => alCambiar(evento.target.checked)}
        />
        <i aria-hidden="true" />
      </span>
      {etiqueta}
    </label>
  );
}

export function Casilla({
  etiqueta,
  marcado,
  alCambiar,
}: {
  etiqueta: ReactNode;
  marcado: boolean;
  alCambiar: (valor: boolean) => void;
}) {
  return (
    <label className="chk">
      <input type="checkbox" checked={marcado} onChange={(evento) => alCambiar(evento.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}

export type Opcion<Valor extends string> = { valor: Valor; texto: ReactNode };

// Control segmentado: una sola opción elegida
export function Segmentado<Valor extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  opciones: Opcion<Valor>[];
  valor: Valor;
  alCambiar: (valor: Valor) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={etiqueta}>
      {opciones.map((opcion) => (
        <button
          key={opcion.valor}
          type="button"
          aria-pressed={opcion.valor === valor}
          onClick={() => alCambiar(opcion.valor)}
        >
          {opcion.texto}
        </button>
      ))}
    </div>
  );
}

export function Ficha({
  presionada,
  alPresionar,
  children,
}: {
  presionada?: boolean;
  alPresionar?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="cp" aria-pressed={presionada} onClick={alPresionar}>
      {children}
    </button>
  );
}

export function EstrellasEditables({
  valor,
  alCambiar,
  etiqueta = 'Tu calificación',
}: {
  valor: number;
  alCambiar: (valor: number) => void;
  etiqueta?: string;
}) {
  return (
    <div className="stars" role="radiogroup" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((posicion) => (
        <button
          key={posicion}
          type="button"
          role="radio"
          aria-checked={posicion === valor}
          aria-label={`${posicion} ${posicion === 1 ? 'estrella' : 'estrellas'}`}
          className={posicion <= valor ? 'on' : undefined}
          onClick={() => alCambiar(posicion)}
        >
          <Icono nombre="i-star" />
        </button>
      ))}
    </div>
  );
}
