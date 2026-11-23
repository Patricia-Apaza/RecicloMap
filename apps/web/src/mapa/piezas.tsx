'use client';

import { CODIGOS_MATERIAL, type CodigoMaterial, NOMBRE_MATERIAL, RADIOS_KM } from '@reciclomap/shared';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { clases } from '@/diseno/clases';
import { Icono, type NombreIcono } from '@/diseno/icono';
import type { EstadoApertura, Opcion } from './resultados';
import { TEXTO_VEHICULO } from './resultados';
import s from './mapa.module.css';

const ICONO_VEHICULO: Record<string, NombreIcono> = {
  MOTO: 'v-moto',
  TRICICLO: 'v-trike',
  CAMIONETA: 'v-van',
  CAMION: 'i-truck',
};

export const iconoNegocio = (opcion: Pick<Opcion, 'tipo' | 'vehiculo'>): NombreIcono =>
  opcion.tipo === 'CENTRO' ? 'i-store' : (ICONO_VEHICULO[opcion.vehiculo ?? ''] ?? 'i-truck');

export const tipoNegocio = (opcion: Pick<Opcion, 'tipo' | 'vehiculo'>) =>
  opcion.tipo === 'CENTRO' ? 'Centro de acopio' : `${TEXTO_VEHICULO[opcion.vehiculo ?? ''] ?? 'Vehículo'} · móvil`;

// Calificación con 3 o más opiniones; si no, "Nuevo"
export function Calificacion({ calificacion }: { calificacion: Opcion['calificacion'] }) {
  if (calificacion.nuevo || calificacion.promedio === null) return <span className="pill grey">Nuevo</span>;
  return (
    <span className={s.calificacion}>
      <Icono nombre="i-star" tamano="sm" />
      <b>{calificacion.promedio.toFixed(1)}</b> <small>({calificacion.cantidad})</small>
    </span>
  );
}

export function EstadoNegocio({ estado }: { estado: EstadoApertura }) {
  const clase = { open: 'open', closed: 'closed', warn: 'warn', grey: 'grey' }[estado.tono];
  return (
    <span className={clases('pill', clase)}>
      <i aria-hidden="true" />
      {estado.texto}
    </span>
  );
}

export function SelectorMaterial({
  material,
  alCambiar,
}: {
  material: CodigoMaterial;
  alCambiar: (material: CodigoMaterial) => void;
}) {
  return (
    <div className={clases(s.fila, s.materiales)} role="group" aria-label="Material">
      {CODIGOS_MATERIAL.map((codigo) => (
        <button
          key={codigo}
          type="button"
          className="cp"
          aria-pressed={codigo === material}
          onClick={() => alCambiar(codigo)}
        >
          <Icono nombre={ICONO_MATERIAL[codigo]} tamano="sm" />
          {NOMBRE_MATERIAL[codigo]}
        </button>
      ))}
    </div>
  );
}

export function SelectorRadio({
  radio,
  alCambiar,
}: {
  radio: number;
  alCambiar: (radio: (typeof RADIOS_KM)[number]) => void;
}) {
  return (
    <div className={s.fila} role="group" aria-label="Radio">
      {RADIOS_KM.map((km) => (
        <button key={km} type="button" className="cp" aria-pressed={km === radio} onClick={() => alCambiar(km)}>
          {km} km
        </button>
      ))}
    </div>
  );
}
