import { z } from 'zod';
import { CODIGOS_MATERIAL } from '../dominio/estados.js';
import { normalizarTelefono, PATRON_TELEFONO } from '../formatos/telefono.js';
import { RADIOS_KM } from './mapa.js';
import { esquemaCoordenada, METODOS_PAGO, PRECIO_KG_MAXIMO, VEHICULOS } from './negocio.js';

const motivoAdmin = z.string().trim().min(5, 'Escribe el motivo (se registra).').max(300, 'Máximo 300 caracteres.');
const decimal = z.union([
  z.number(),
  z
    .string()
    .trim()
    .transform((texto) => Number(texto.replace(',', '.'))),
]);

// Pantalla 16: solo el reciclador reporta; el negocio nunca sabe quién fue
export const MOTIVOS_REPORTE_NEGOCIO = ['PRECIO', 'CERRADO', 'UBICACION', 'FALSA', 'OTRO'] as const;
export type MotivoReporteNegocio = (typeof MOTIVOS_REPORTE_NEGOCIO)[number];
export const TEXTO_MOTIVO_REPORTE: Record<string, string> = {
  PRECIO: 'Precio incorrecto',
  CERRADO: 'Estaba cerrado',
  UBICACION: 'Ubicación errónea',
  FALSA: 'Información falsa',
  OTRO: 'Otro',
  NO_LLEGO: 'No llegó',
  PESO: 'El peso no coincide',
  PAGO: 'Pago distinto a lo acordado',
  TRATO: 'Mal trato',
  NO_CONFIRMA: 'Entrega sin confirmar',
  NO_CONFORME: 'No conforme con los kilos',
  RESENA_INAPROPIADA: 'Reseña inapropiada',
};

export const esquemaReporteNegocio = z
  .object({
    compradorId: z.uuid('Elige el negocio.'),
    motivo: z.enum(MOTIVOS_REPORTE_NEGOCIO, { error: 'Elige qué pasa.' }),
    material: z.enum(CODIGOS_MATERIAL).optional().nullable(),
    precioVisto: decimal
      .pipe(z.number().gt(0, 'Escribe un precio mayor a 0.').max(PRECIO_KG_MAXIMO, 'Revisa el precio.'))
      .optional()
      .nullable(),
    detalle: z.string().trim().max(240, 'Máximo 240 caracteres.').optional().nullable(),
  })
  .refine((datos) => !['FALSA', 'OTRO'].includes(datos.motivo) || (datos.detalle?.length ?? 0) >= 5, {
    message: 'Cuéntanos un poco más para poder revisarlo.',
    path: ['detalle'],
  });

// Pantalla 29: un problema de la operación lo puede reportar cualquiera de las partes
export const TIPOS_PROBLEMA_OPERACION = ['NO_LLEGO', 'PESO', 'PAGO', 'TRATO', 'OTRO'] as const;
export const esquemaProblemaOperacion = z.object({
  tipo: z.enum(TIPOS_PROBLEMA_OPERACION, { error: 'Elige qué pasó.' }),
  detalle: z.string().trim().min(15, 'Escribe al menos 15 caracteres.').max(300, 'Máximo 300 caracteres.'),
});

// Plazos que ofrecen las pantallas 60 y 61
export const PLAZOS_CORRECCION_HORAS = [24, 48, 72, 168] as const;
const plazoHoras = z.coerce
  .number({ error: 'Elige un plazo.' })
  .refine((valor) => (PLAZOS_CORRECCION_HORAS as readonly number[]).includes(valor), 'Elige un plazo.');

export const esquemaMotivoAdmin = z.object({ motivo: motivoAdmin });
export const esquemaCorreccionAdmin = z.object({ motivo: motivoAdmin, plazoHoras });

export const TIPOS_REPORTE_ADMIN = ['NEGOCIO', 'RESENA'] as const;
export const ESTADOS_REPORTE_ADMIN = ['pendientes', 'en-revision', 'cerrados'] as const;
export const esquemaFiltroReportesAdmin = z.object({
  tipo: z.enum(TIPOS_REPORTE_ADMIN).default('NEGOCIO'),
  estado: z.enum(ESTADOS_REPORTE_ADMIN).default('pendientes'),
});

export const esquemaFiltroReportesNegocio = z.object({
  estado: z.enum(['todos', 'correccion', 'revision', 'resueltos']).default('todos'),
});

// Pantalla 18: el mismo conjunto y el mismo semáforo que el mapa
export const esquemaCalculadora = z.object({
  material: z.enum(CODIGOS_MATERIAL, { error: 'Elige un material.' }),
  kg: decimal.pipe(
    z.number({ error: 'Escribe los kilos.' }).gt(0, 'Escribe un número mayor a 0.').max(5000, 'Hasta 5 000 kg.'),
  ),
  radio: z.coerce
    .number()
    .refine((valor) => (RADIOS_KM as readonly number[]).includes(valor), 'Radio no permitido.')
    .default(5),
});

// Pantalla 20: hasta 3 negocios; el semáforo se calcula solo entre ellos
export const MAXIMO_COMPARAR = 3;
export const esquemaComparar = z.object({
  ids: z
    .string()
    .transform((texto) => [
      ...new Set(
        texto
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.uuid('Negocio no válido.'))
        .min(2, 'Elige al menos 2 negocios.')
        .max(MAXIMO_COMPARAR, `Compara hasta ${MAXIMO_COMPARAR} negocios.`),
    ),
});

// Pantalla 21: el trazo lo pide el servidor; el modo es el de la pantalla
export const MODOS_RUTA = ['pie', 'moto', 'transporte'] as const;
export type ModoRuta = (typeof MODOS_RUTA)[number];
export const esquemaRuta = z.object({ modo: z.enum(MODOS_RUTA).default('pie') });
export const esquemaSolicitudLlegada = z.object({ material: z.enum(CODIGOS_MATERIAL).optional().nullable() });

// Pantalla 19: alertas opcionales por favorito; es la única vía de alertas de precio
export const esquemaAlertasFavorito = z
  .object({ alertaPrecio: z.boolean().optional(), alertaAvisos: z.boolean().optional() })
  .refine(
    (datos) => datos.alertaPrecio !== undefined || datos.alertaAvisos !== undefined,
    'Indica qué quieres cambiar.',
  );

// Pantalla 22: cambiar el teléfono exige verificarlo de nuevo
export const esquemaPerfilReciclador = z.object({
  nombre: z.string().trim().min(3, 'Escribe tu nombre (mínimo 3 letras).').max(60, 'Máximo 60 caracteres.'),
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .refine((valor) => valor === '' || z.email().safeParse(valor).success, 'Escribe un correo válido.')
    .transform((valor) => (valor === '' ? null : valor))
    .optional()
    .nullable(),
  zonaId: z.number().int().max(32767).positive({ error: 'Elige tu zona.' }),
  sobreMi: z.string().trim().max(140, 'Máximo 140 caracteres.').optional().nullable(),
});

export const esquemaCorreoCuenta = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(120)
    .refine((valor) => valor === '' || z.email().safeParse(valor).success, 'Escribe un correo válido.')
    .transform((valor) => (valor === '' ? null : valor)),
});

const telefono = z
  .string({ error: 'Escribe tu número.' })
  .transform(normalizarTelefono)
  .refine((valor) => PATRON_TELEFONO.test(valor), 'Ingresa 9 dígitos que empiecen con 9.');
export const esquemaCambiarTelefono = z.object({ telefono });
export const esquemaConfirmarTelefono = z.object({
  telefono,
  codigo: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos.'),
});

export const esquemaPreferenciasCuenta = z
  .object({ visibleEnRanking: z.boolean().optional() })
  .refine((datos) => datos.visibleEnRanking !== undefined, 'Indica qué quieres cambiar.');

// Pantalla 47: datos y horario se guardan al momento; la dirección pasa por el administrador (S5)
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe la hora como 08:00.');
export const esquemaDatosNegocio = z.object({
  nombreComercial: z.string().trim().min(3, 'Escribe al menos 3 letras.').max(120),
  descripcion: z.string().trim().max(160, 'Máximo 160 caracteres.').optional().nullable(),
  whatsapp: telefono,
  telefonoNegocio: telefono.optional().nullable(),
  vehiculo: z.enum(VEHICULOS).optional().nullable(),
});

export const esquemaHorariosNegocio = z.object({
  dias: z
    .array(
      z
        .object({ dia: z.number().int().min(1).max(7), abre: hora, cierra: hora })
        .refine((fila) => fila.cierra > fila.abre, { message: 'La hora final debe ser posterior a la inicial.' }),
    )
    .max(7)
    .refine((lista) => new Set(lista.map((fila) => fila.dia)).size === lista.length, 'Hay días repetidos.'),
  habitual: z
    .object({ abre: hora, cierra: hora })
    .refine((fila) => fila.cierra > fila.abre, { message: 'La hora final debe ser posterior a la inicial.' })
    .optional()
    .nullable(),
});

export const esquemaPagosNegocio = z.object({
  pagos: z.array(z.enum(METODOS_PAGO)).max(METODOS_PAGO.length),
});

export const esquemaCambioDireccion = z.object({
  direccion: z.string().trim().min(5, 'Escribe la dirección del local.').max(160),
  zonaId: z.number().int().max(32767).positive({ error: 'Elige la zona del local.' }),
  ubicacion: esquemaCoordenada.optional().nullable(),
});

export const esquemaFiltroAlertas = z.object({ dias: z.coerce.number().int().min(7).max(90).default(30) });
