import { z } from 'zod';
import { CODIGOS_MATERIAL, type CodigoMaterial, DEMANDAS } from '../dominio/estados.js';
import { NOMBRE_MATERIAL } from '../dominio/etiquetas.js';
import { normalizarTelefono, PATRON_TELEFONO } from '../formatos/telefono.js';

export const PRECIO_KG_MINIMO = 0.1;
export const PRECIO_KG_MAXIMO = 50;

export const METODOS_PAGO = ['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA'] as const;
export const VEHICULOS = ['MOTO', 'TRICICLO', 'CAMIONETA', 'CAMION'] as const;

const telefono = z
  .string()
  .transform(normalizarTelefono)
  .refine((valor) => PATRON_TELEFONO.test(valor), 'Ingresa 9 dígitos que empiecen con 9.');

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe la hora como 08:00.');

const precioEnSoles = (material: string, extremo: 'mínimo' | 'máximo') =>
  z.coerce
    .number({ error: `Falta el precio ${extremo} de ${material}.` })
    .refine((valor) => Number.isFinite(valor), `Falta el precio ${extremo} de ${material}.`)
    .refine(
      (valor) => valor >= PRECIO_KG_MINIMO && valor <= PRECIO_KG_MAXIMO,
      `El precio de ${material} debe estar entre S/ 0.10 y S/ 50.00 por kg.`,
    )
    .refine(
      (valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
      `Usa como máximo dos decimales en el precio de ${material}.`,
    );

function esquemaPrecio(codigo: CodigoMaterial) {
  const material = NOMBRE_MATERIAL[codigo];
  return z
    .object({
      min: precioEnSoles(material, 'mínimo'),
      max: precioEnSoles(material, 'máximo'),
      demanda: z.enum(DEMANDAS).default('MEDIA'),
    })
    .refine((precio) => precio.max >= precio.min, {
      message: `En ${material}, el precio máximo no puede ser menor que el mínimo.`,
      path: ['max'],
    });
}

export const esquemaPrecios = z
  .object(
    Object.fromEntries(CODIGOS_MATERIAL.map((codigo) => [codigo, esquemaPrecio(codigo).optional()])) as {
      [C in CodigoMaterial]: z.ZodOptional<ReturnType<typeof esquemaPrecio>>;
    },
  )
  .refine((precios) => Object.values(precios).some(Boolean), 'Marca al menos un material que compras.');

export type PreciosNegocio = z.infer<typeof esquemaPrecios>;

const dias = z.array(z.number().int().min(1).max(7)).min(1, 'Elige al menos un día.');
const cierraDespues = {
  message: 'La hora de cierre debe ser posterior a la de apertura.',
  path: ['cierra'],
};

export const esquemaHorario = z
  .object({ dias, abre: hora, cierra: hora })
  .refine((horario) => horario.cierra > horario.abre, cierraDespues);

// La pantalla 06 solo pide el horario habitual: los días quedan como no indicados
export const esquemaHorarioMovil = z
  .object({ abre: hora, cierra: hora })
  .refine((horario) => horario.cierra > horario.abre, cierraDespues);

export const MAXIMO_FOTOS_NEGOCIO = 3;
const fotos = z
  .array(z.uuid('Foto no válida.'))
  .max(MAXIMO_FOTOS_NEGOCIO, `Sube como máximo ${MAXIMO_FOTOS_NEGOCIO} fotos.`)
  .refine((lista) => new Set(lista).size === lista.length, 'Hay fotos repetidas.')
  .default([]);

const base = {
  nombreComercial: z.string().trim().min(2, 'Escribe el nombre del negocio.').max(120),
  descripcion: z.string().trim().max(160, 'Máximo 160 caracteres.').optional(),
  whatsapp: telefono,
  precios: esquemaPrecios,
  fotos,
};

export const esquemaCoordenada = z.object(
  {
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  },
  { error: 'Coloca el pin de tu local en el mapa.' },
);
const coordenada = esquemaCoordenada;

// Pin del centro en el mapa (pantallas 05 y 43)
export const esquemaUbicacionNegocio = z.object({ ubicacion: esquemaCoordenada });

export const esquemaRegistroCentro = z.object({
  tipo: z.literal('CENTRO'),
  ...base,
  horario: esquemaHorario,
  pagos: z.array(z.enum(METODOS_PAGO)).min(1, 'Elige al menos un método de pago.'),
  direccion: z.string().trim().min(5, 'Escribe la dirección del local.').max(160),
  telefonoNegocio: telefono.optional(),
  zonaId: z.number().int().max(32767).positive({ error: 'Elige la zona del local.' }),
  // Obligatoria cuando el mapa está disponible; la API lo exige si hay clave de Google Maps
  ubicacion: coordenada.optional(),
});

export const esquemaRegistroMovil = z.object({
  tipo: z.literal('MOVIL'),
  ...base,
  horario: esquemaHorarioMovil,
  pagos: z.array(z.enum(METODOS_PAGO)).default([]),
  vehiculo: z.enum(VEHICULOS, { error: 'Elige tu vehículo.' }),
  zonaId: z.number().int().max(32767).positive({ error: 'Elige tu zona de trabajo.' }),
});

export const esquemaRegistroNegocioCompleto = z.discriminatedUnion('tipo', [
  esquemaRegistroCentro,
  esquemaRegistroMovil,
]);
export type RegistroNegocioCompleto = z.infer<typeof esquemaRegistroNegocioCompleto>;

export const esquemaBorradorNegocio = z.object({
  paso: z.number().int().min(1).max(6),
  datos: z.record(z.string(), z.unknown()),
});

export const MOTIVOS_RECHAZO = [
  'Dirección no verificable',
  'Fotos insuficientes o ilegibles',
  'Datos de contacto inválidos',
  'Negocio duplicado',
  'Otro motivo',
] as const;

export const MOTIVOS_INFORMACION = [
  'Falta foto del local',
  'Falta confirmar el horario',
  'Precio fuera de lo habitual',
  'Otro dato',
] as const;

export const esquemaRechazo = z.object({
  motivo: z.enum(MOTIVOS_RECHAZO, { error: 'Elige un motivo.' }),
  mensaje: z.string().trim().min(5, 'Escribe un mensaje breve para el negocio.').max(300),
});

export const esquemaPedirInformacion = z.object({
  motivo: z.enum(MOTIVOS_INFORMACION, { error: 'Elige un motivo.' }),
  mensaje: z.string().trim().min(5, 'Escribe qué debe completar.').max(300),
});
