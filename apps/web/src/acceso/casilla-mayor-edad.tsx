'use client';

import { Icono } from '@/diseno/icono';
import { Casilla } from '@/diseno/formulario';

// Declaración de mayoría de edad del registro, a la espera de lo que indique el profesional legal
export function CasillaMayorEdad({
  marcado,
  alCambiar,
  error,
}: {
  marcado: boolean;
  alCambiar: (valor: boolean) => void;
  error?: string;
}) {
  return (
    <div className={error ? 'field err' : 'field'}>
      <Casilla marcado={marcado} alCambiar={alCambiar} etiqueta="Declaro que soy mayor de 18 años." />
      {error && (
        <span className="msg" role="alert">
          <Icono nombre="i-alert" tamano="sm" />
          {error}
        </span>
      )}
    </div>
  );
}
