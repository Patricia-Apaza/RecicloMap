'use client';

import { useEffect, useMemo } from 'react';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { TIPOS_ACEPTADOS } from './fotos';

// Círculo para elegir una foto; la vista previa se arma en el propio celular
export function SelectorAvatar({
  archivo,
  alElegir,
  etiqueta,
  previa,
}: {
  archivo: File | null;
  alElegir: (archivo: File | null) => void;
  etiqueta: string;
  previa?: string | null;
}) {
  const url = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const imagen = url ?? previa ?? null;

  return (
    <label className={clases('ac-avatar', imagen && 'lleno')} aria-label={etiqueta}>
      {imagen ? (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local, no pasa por el optimizador
        <img alt="Tu foto" src={imagen} />
      ) : (
        <Icono nombre="i-camera" tamano="lg" />
      )}
      <input
        type="file"
        accept={TIPOS_ACEPTADOS}
        onChange={(evento) => {
          alElegir(evento.target.files?.[0] ?? null);
          evento.target.value = '';
        }}
      />
    </label>
  );
}
