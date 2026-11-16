import { clases } from './clases';

export const NOMBRES_ICONO = [
  'i-pin',
  'i-recycle',
  'i-user',
  'i-truck',
  'i-check',
  'i-alert',
  'i-star',
  'i-leaf',
  'i-store',
  'i-lock',
  'i-gift',
  'i-trophy',
  'i-activity',
  'i-building',
  'm-pet',
  'm-box',
  'm-paper',
  'm-plastic',
  'm-metal',
  'i-clock',
  'i-phone',
  'i-whatsapp',
  'i-close',
  'i-info',
  'i-arrow-left',
  'i-arrow-right',
  'i-shield',
  'i-plus',
  'i-heart',
  'i-dash',
  'i-down',
  'i-tick',
  'i-dots',
  'i-nav',
  'i-cal',
  'i-calc',
  'i-bell',
  'i-cash',
  'i-bank',
  'v-moto',
  'v-trike',
  'v-van',
  'i-map',
  'i-search',
  'i-camera',
  'i-eye',
  'i-eye-off',
  'i-mail',
  'i-tag',
] as const;

export type NombreIcono = (typeof NOMBRES_ICONO)[number];

type Propiedades = {
  nombre: NombreIcono;
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
  // Sin etiqueta, el ícono es decorativo y el lector de pantalla lo ignora
  etiqueta?: string;
};

export function Icono({ nombre, tamano = 'md', className, etiqueta }: Propiedades) {
  return (
    <svg
      className={clases('ic', tamano !== 'md' && tamano, className)}
      aria-hidden={etiqueta ? undefined : true}
      role={etiqueta ? 'img' : undefined}
      aria-label={etiqueta}
      focusable="false"
    >
      <use href={`/iconos.svg#${nombre}`} />
    </svg>
  );
}
