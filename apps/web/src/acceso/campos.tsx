'use client';

import { type InputHTMLAttributes, type ReactNode, useId, useRef, useState } from 'react';
import { clases } from '@/diseno/clases';
import { Icono, type NombreIcono } from '@/diseno/icono';

type PropiedadesCampo = {
  etiqueta: ReactNode;
  icono?: NombreIcono;
  opcional?: boolean;
  error?: string;
  ayuda?: ReactNode;
  derecha?: ReactNode;
  debajo?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

export function CampoIcono({
  etiqueta,
  icono,
  opcional,
  error,
  ayuda,
  derecha,
  debajo,
  className,
  ...entrada
}: PropiedadesCampo) {
  const id = useId();
  const descritoPor = [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clases('field', error && 'err', className)}>
      <label htmlFor={id}>
        {etiqueta} {opcional && <span className="opt">(opcional)</span>}
      </label>
      <div className="inp">
        {icono && <Icono nombre={icono} />}
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={descritoPor} {...entrada} />
        {derecha}
      </div>
      {debajo}
      {ayuda && !error && (
        <span className="hint" id={`${id}-ayuda`}>
          {ayuda}
        </span>
      )}
      {error && (
        <span className="msg" id={`${id}-error`} role="alert">
          <Icono nombre="i-alert" tamano="sm" />
          {error}
        </span>
      )}
    </div>
  );
}

// Medidor del prototipo: largo, letras con números, mayúsculas y minúsculas, símbolos o 12 caracteres
export function fuerzaContrasena(valor: string): 0 | 1 | 2 | 3 | 4 {
  if (!valor) return 0;
  let puntos = 0;
  if (valor.length >= 8) puntos++;
  if (/[a-z]/i.test(valor) && /\d/.test(valor)) puntos++;
  if (/[A-Z]/.test(valor) && /[a-z]/.test(valor)) puntos++;
  if (/[^A-Za-z0-9]/.test(valor) || valor.length >= 12) puntos++;
  return puntos as 0 | 1 | 2 | 3 | 4;
}

const TEXTO_FUERZA = [
  'Usa 8 o más caracteres con letras y números.',
  'Contraseña débil',
  'Contraseña aceptable',
  'Contraseña buena',
  'Contraseña fuerte',
];

export function CampoContrasena({
  etiqueta = 'Contraseña',
  nueva,
  medidor,
  error,
  valor,
  alCambiar,
  ...resto
}: {
  etiqueta?: string;
  nueva?: boolean;
  medidor?: boolean;
  error?: string;
  valor: string;
  alCambiar: (valor: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [visible, setVisible] = useState(false);
  const fuerza = fuerzaContrasena(valor);
  return (
    <CampoIcono
      etiqueta={etiqueta}
      icono="i-lock"
      type={visible ? 'text' : 'password'}
      autoComplete={nueva ? 'new-password' : 'current-password'}
      placeholder="Mínimo 8 caracteres"
      value={valor}
      onChange={(evento) => alCambiar(evento.target.value)}
      error={error}
      {...resto}
      derecha={
        <button
          type="button"
          className="ac-mostrar"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((actual) => !actual)}
        >
          <Icono nombre={visible ? 'i-eye-off' : 'i-eye'} />
        </button>
      }
      debajo={
        medidor && (
          <>
            <div className={clases('ac-medidor', fuerza > 0 && `n${fuerza}`)} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="hint" aria-live="polite">
              {TEXTO_FUERZA[fuerza]}
            </span>
          </>
        )
      }
    />
  );
}

// "951234567" → "951 234 567" mientras se escribe
export function mascaraTelefono(texto: string): string {
  const digitos = texto
    .replace(/\D/g, '')
    .replace(/^51(?=9\d{8}$)/, '')
    .slice(0, 9);
  return [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9)].filter(Boolean).join(' ');
}

export function CodigoSeisDigitos({
  valor,
  alCambiar,
  error,
  etiqueta = 'Código de 6 dígitos',
}: {
  valor: string;
  alCambiar: (valor: string) => void;
  error?: string;
  etiqueta?: string;
}) {
  const casillas = useRef<Array<HTMLInputElement | null>>([]);
  const digitos = Array.from({ length: 6 }, (_, indice) => valor[indice] ?? '');

  const fijar = (indice: number, texto: string) => {
    const limpio = texto.replace(/\D/g, '');
    if (limpio.length > 1) {
      // Pegar el código completo desde el SMS
      const nuevo = limpio.slice(0, 6);
      alCambiar(nuevo);
      casillas.current[Math.min(nuevo.length, 5)]?.focus();
      return;
    }
    const lista = [...digitos];
    lista[indice] = limpio;
    alCambiar(lista.join('').slice(0, 6));
    if (limpio && indice < 5) casillas.current[indice + 1]?.focus();
  };

  return (
    <div className={clases('field', error && 'err')}>
      <div className="ac-codigo" role="group" aria-label={etiqueta}>
        {digitos.map((digito, indice) => (
          <input
            key={indice}
            ref={(elemento) => {
              casillas.current[indice] = elemento;
            }}
            inputMode="numeric"
            autoComplete={indice === 0 ? 'one-time-code' : 'off'}
            maxLength={indice === 0 ? 6 : 1}
            aria-label={`Dígito ${indice + 1}`}
            value={digito}
            onChange={(evento) => fijar(indice, evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Backspace' && !digito && indice > 0) casillas.current[indice - 1]?.focus();
            }}
          />
        ))}
      </div>
      {error && (
        <span className="msg" role="alert">
          <Icono nombre="i-alert" tamano="sm" />
          {error}
        </span>
      )}
    </div>
  );
}
