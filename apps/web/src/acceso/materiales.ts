import type { CodigoMaterial } from '@reciclomap/shared';
import type { NombreIcono } from '@/diseno/icono';

export const ICONO_MATERIAL: Record<CodigoMaterial, NombreIcono> = {
  pet: 'm-pet',
  carton: 'm-box',
  papel: 'm-paper',
  plastico: 'm-plastic',
  metal: 'm-metal',
};

// Qué entra en cada material, para elegir sin dudar
export const DESCRIPCION_MATERIAL: Record<CodigoMaterial, string> = {
  pet: 'Botellas de bebidas y envases transparentes.',
  carton: 'Cajas y empaques de cartón.',
  papel: 'Hojas, cuadernos y periódicos.',
  plastico: 'Baldes, sillas y envases rígidos.',
  metal: 'Latas, aluminio, cobre y fierro.',
};

export type Material = { id: number; codigo: CodigoMaterial; nombre: string };
