import { z } from 'zod';
import { CODIGOS_MATERIAL } from '../dominio/estados.js';
import { METODOS_PAGO } from './negocio.js';

export const RADIOS_KM = [1, 3, 5, 10, 20] as const;
export type RadioKm = (typeof RADIOS_KM)[number];

export const ORDENES_MAPA = ['recomendado', 'precio', 'cercania', 'demanda', 'calificacion'] as const;
export type OrdenMapa = (typeof ORDENES_MAPA)[number];

export const TIPOS_MAPA = ['todos', 'centro', 'movil'] as const;
export type TipoMapa = (typeof TIPOS_MAPA)[number];

const booleanoTexto = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((valor) => valor === true || valor === 'true' || valor === '1');

const listaPagos = z.union([z.array(z.enum(METODOS_PAGO)), z.string()]).transform((valor, contexto) => {
  const lista = typeof valor === 'string' ? valor.split(',').filter(Boolean) : valor;
  const desconocido = lista.find((metodo) => !(METODOS_PAGO as readonly string[]).includes(metodo));
  if (desconocido) {
    contexto.addIssue({ code: 'custom', message: `Método de pago no válido: ${desconocido}.` });
    return z.NEVER;
  }
  return lista as Array<(typeof METODOS_PAGO)[number]>;
});

// Filtros del mapa, la lista y las búsquedas guardadas (pantallas 09, 10 y 11)
export const esquemaFiltrosMapa = z.object({
  material: z.enum(CODIGOS_MATERIAL, { error: 'Elige un material.' }),
  radio: z.coerce
    .number()
    .refine(
      (valor): valor is RadioKm => (RADIOS_KM as readonly number[]).includes(valor),
      'El radio debe ser 1, 3, 5, 10 o 20 km.',
    )
    .default(5),
  tipo: z.enum(TIPOS_MAPA).default('todos'),
  orden: z.enum(ORDENES_MAPA).default('recomendado'),
  pagos: listaPagos.default([]),
  demandaMinima: z.enum(['MEDIA', 'ALTA']).optional(),
  soloAbiertos: booleanoTexto.default(false),
  soloAlDia: booleanoTexto.default(false),
});
export type FiltrosMapa = z.infer<typeof esquemaFiltrosMapa>;

export const MAXIMO_BUSQUEDAS = 5;

export const esquemaBusquedaGuardada = z.object({
  nombre: z.string().trim().min(1, 'Ponle un nombre a la búsqueda.').max(80),
  filtros: esquemaFiltrosMapa,
});

export const esquemaDetalleNegocio = z.object({
  material: z.enum(CODIGOS_MATERIAL).optional(),
  radio: esquemaFiltrosMapa.shape.radio,
});

// "lat,lng" redondeado a unos 100 m: así viaja la posición, en una cabecera y nunca en la URL
export const esquemaPosicion = z
  .string()
  .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, 'Posición no válida.')
  .transform((texto) => {
    const [lat, lng] = texto.split(',').map(Number) as [number, number];
    return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
  })
  .refine((punto) => Math.abs(punto.lat) <= 90 && Math.abs(punto.lng) <= 180, 'Posición no válida.');

export function redondearPosicion(lat: number, lng: number): string {
  return `${(Math.round(lat * 1000) / 1000).toFixed(3)},${(Math.round(lng * 1000) / 1000).toFixed(3)}`;
}

// Búsqueda de direcciones: solo con el botón «Buscar», nunca mientras se escribe
export const esquemaBuscarDireccion = z.object({
  q: z.string().trim().min(3, 'Escribe al menos 3 letras de la dirección.').max(120, 'La dirección es muy larga.'),
});
