import { z } from 'zod';
import { CODIGOS_MATERIAL, DISPONIBILIDADES } from '../dominio/estados.js';
import { PRECIO_KG_MAXIMO, PRECIO_KG_MINIMO } from './negocio.js';

export const KG_MINIMO_PUBLICACION = 1;
export const KG_MAXIMO_PUBLICACION = 5000;
export const MAXIMO_FOTOS_PUBLICACION = 3;
export const LARGO_NOTA_PUBLICACION = 140;
export const LARGO_MENSAJE_OFERTA = 140;

export const GRUPOS_PUBLICACION = ['activas', 'finalizadas', 'vencidas', 'canceladas'] as const;
export type GrupoPublicacion = (typeof GRUPOS_PUBLICACION)[number];

export const MOTIVOS_CANCELACION = ['Ya vendí el material', 'Me equivoqué al publicar', 'Cambié de planes'] as const;
export const CUANDO_RECOGE = ['Hoy por la tarde', 'Mañana por la mañana', 'Mañana por la tarde', 'En 2 días'] as const;

// Acepta "2,60" del teclado del celular y lo convierte en número
const numeroDecimal = z.preprocess(
  (valor) => (typeof valor === 'string' ? (valor.trim() === '' ? undefined : Number(valor.replace(',', '.'))) : valor),
  z.number({ error: 'Escribe un número.' }),
);

const kilos = numeroDecimal.pipe(
  z
    .number()
    .min(KG_MINIMO_PUBLICACION, 'Escribe un peso entre 1 y 5 000 kg.')
    .max(KG_MAXIMO_PUBLICACION, 'Escribe un peso entre 1 y 5 000 kg.')
    .refine((valor) => Number.isInteger(Math.round(valor * 100)), 'Usa como máximo 2 decimales.'),
);

export const esquemaKilos = kilos;

const precioKg = (mensaje: string) =>
  numeroDecimal.pipe(z.number().min(PRECIO_KG_MINIMO, mensaje).max(PRECIO_KG_MAXIMO, mensaje));

const MENSAJE_PRECIO = 'Escribe un precio entre S/ 0.10 y S/ 50.00 por kg.';

// Un campo opcional vacío en el formulario cuenta como no indicado
const vacioANulo = (valor: unknown) => (typeof valor === 'string' && valor.trim() === '' ? null : valor);

const camposEditables = {
  kg: kilos,
  precioEsperado: z.preprocess(vacioANulo, precioKg(MENSAJE_PRECIO).nullable().optional()),
  nota: z.string().trim().max(LARGO_NOTA_PUBLICACION, 'Máximo 140 caracteres.').optional().nullable(),
  fotos: z.array(z.uuid()).max(MAXIMO_FOTOS_PUBLICACION, 'Puedes subir hasta 3 fotos.').default([]),
};

// Pantalla 12: la ciudad sale de la cuenta y la ubicación de la cabecera X-Posicion o X-Zona
export const esquemaNuevaPublicacion = z.object({
  material: z.enum(CODIGOS_MATERIAL, { error: 'Elige un material.' }),
  ...camposEditables,
});
export type NuevaPublicacion = z.infer<typeof esquemaNuevaPublicacion>;

// Pantalla 23: solo sin ofertas pendientes
export const esquemaEditarPublicacion = z.object(camposEditables);
export type EdicionPublicacion = z.infer<typeof esquemaEditarPublicacion>;

export const esquemaCancelarPublicacion = z.object({
  motivo: z.string().trim().min(3, 'Elige un motivo.').max(200),
});

export const esquemaGrupoPublicacion = z.object({
  grupo: z.enum(GRUPOS_PUBLICACION).default('activas'),
});

// Pantallas 42 y 44: precio por kg, el total lo calcula el servidor
export const esquemaOferta = z.object({
  precioKg: precioKg(MENSAJE_PRECIO),
  mensaje: z.string().trim().max(LARGO_MENSAJE_OFERTA, 'Máximo 140 caracteres.').optional().nullable(),
  cuandoRecoge: z.enum(CUANDO_RECOGE, { error: 'Elige cuándo puedes recoger.' }).optional().nullable(),
});
export type DatosOferta = z.infer<typeof esquemaOferta>;

export const ESTADOS_FILTRO_OFERTAS = ['todas', 'pendientes', 'aceptadas', 'no-seleccionadas', 'retiradas'] as const;
export const esquemaFiltroOfertas = z.object({
  estado: z.enum(ESTADOS_FILTRO_OFERTAS).default('todas'),
});

export const esquemaFiltroCercanas = z.object({
  material: z.enum(CODIGOS_MATERIAL).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(20),
});

// Pantalla 52: estado del comprador móvil y su zona de trabajo
export const esquemaEstadoMovil = z
  .object({
    disponibilidad: z.enum(DISPONIBILIDADES).optional(),
    zonaId: z.number().int().max(32767).positive().optional(),
    mostrarZona: z.boolean().optional(),
  })
  .refine((valor) => Object.values(valor).some((campo) => campo !== undefined), 'Indica qué quieres cambiar.');
export type EstadoMovil = z.infer<typeof esquemaEstadoMovil>;
