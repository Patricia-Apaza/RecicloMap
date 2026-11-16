import { z } from 'zod';
import { CODIGOS_MATERIAL } from '../dominio/estados.js';
import { esquemaCoordenada } from './negocio.js';
import { KG_MAXIMO_PUBLICACION } from './publicaciones.js';

export const FRANJAS = ['MANANA', 'TARDE', 'NOCHE'] as const;
export type Franja = (typeof FRANJAS)[number];
export const TEXTO_FRANJA: Record<Franja, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche' };

export const MOTIVOS_CANCELACION_OPERACION = [
  'No llegamos a un acuerdo',
  'La otra persona no responde',
  'Cambió la cantidad de material',
  'Ya vendí el material',
  'Otro motivo',
] as const;

const decimal = z.preprocess(
  (valor) => (typeof valor === 'string' ? (valor.trim() === '' ? undefined : Number(valor.replace(',', '.'))) : valor),
  z.number({ error: 'Escribe los kilos recibidos.' }),
);

// Pantalla 25: punto de encuentro, nunca precargado con la ubicación del reciclador (C3)
export const esquemaCoordinar = z
  .object({
    tipo: z.enum(['LOCAL_DEL_CENTRO', 'REFERENCIA'], { error: 'Elige dónde se encuentran.' }),
    referencia: z.string().trim().max(160, 'Máximo 160 caracteres.').optional().nullable(),
    pin: esquemaCoordenada.optional().nullable(),
    dia: z.iso.date({ error: 'Elige un día válido.' }).optional().nullable(),
    franja: z.enum(FRANJAS).optional().nullable(),
    mensaje: z.string().trim().max(140, 'Máximo 140 caracteres.').optional().nullable(),
  })
  .refine((datos) => datos.tipo === 'LOCAL_DEL_CENTRO' || (datos.referencia?.length ?? 0) >= 5, {
    message: 'Escribe una referencia del punto de encuentro (por ejemplo, la esquina o un lugar conocido).',
    path: ['referencia'],
  });
export type DatosCoordinacion = z.infer<typeof esquemaCoordinar>;

// Pantallas 26 y 54: solo el negocio escribe los kilos recibidos (C9)
export const esquemaConfirmarRecepcion = z.object({
  kgRecibidos: decimal.pipe(
    z
      .number()
      .gt(0, 'Los kilos recibidos deben ser mayores a 0.')
      .max(KG_MAXIMO_PUBLICACION, 'Escribe un peso de hasta 5 000 kg.')
      .refine((valor) => Number.isInteger(Math.round(valor * 100)), 'Usa como máximo 2 decimales.'),
  ),
});

export const esquemaMotivoOperacion = z.object({
  motivo: z.string().trim().min(3, 'Elige o escribe un motivo.').max(200, 'Máximo 200 caracteres.'),
});

export const esquemaDetalleIncidencia = z.object({
  detalle: z.string().trim().min(5, 'Cuéntanos qué pasó.').max(300, 'Máximo 300 caracteres.'),
});

// Pantalla 27: una calificación por autor y operación
export const esquemaCalificar = z.object({
  estrellas: z.number({ error: 'Elige de 1 a 5 estrellas.' }).int().min(1, 'Elige de 1 a 5 estrellas.').max(5),
  etiquetas: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
  comentario: z.string().trim().max(300, 'Máximo 300 caracteres.').optional().nullable(),
});
export type DatosCalificacion = z.infer<typeof esquemaCalificar>;

export const esquemaRespuestaResena = z.object({
  texto: z.string().trim().min(3, 'Escribe tu respuesta.').max(300, 'Máximo 300 caracteres.'),
});

export const esquemaReporteResena = z.object({
  detalle: z.string().trim().max(300, 'Máximo 300 caracteres.').optional().nullable(),
});

// Resolución mínima del administrador (S4): nunca escribe el peso
export const DECISIONES_INCIDENCIA = [
  'PEDIR_CORRECCION',
  'CERRAR_CON_KILOS_VIGENTES',
  'ANULAR',
  'RESOLVER',
  'DESCARTAR',
] as const;
export const esquemaResolverIncidencia = z.object({
  decision: z.enum(DECISIONES_INCIDENCIA, { error: 'Elige una decisión.' }),
  motivo: z.string().trim().min(5, 'Explica la decisión.').max(300, 'Máximo 300 caracteres.'),
});

export const ESTADOS_FILTRO_HISTORIAL = ['todas', 'en-curso', 'completadas', 'canceladas'] as const;
export const esquemaFiltroHistorial = z.object({
  estado: z.enum(ESTADOS_FILTRO_HISTORIAL).default('todas'),
  material: z.enum(CODIGOS_MATERIAL).optional(),
});

// Pantalla 32: grupos de notificaciones; las de una operación propia y las de la cuenta no se apagan
export const GRUPOS_NOTIFICACION = ['ofertas', 'operaciones', 'premios', 'avisos'] as const;
export type GrupoNotificacion = (typeof GRUPOS_NOTIFICACION)[number];
export const esquemaFiltroNotificaciones = z.object({
  filtro: z.enum(['todas', 'sin-leer', ...GRUPOS_NOTIFICACION]).default('todas'),
});
export const esquemaPreferenciasNotificacion = z
  .object({
    ofertas: z.boolean().optional(),
    premios: z.boolean().optional(),
    avisos: z.boolean().optional(),
    precios: z.boolean().optional(),
  })
  .refine((valor) => Object.values(valor).some((campo) => campo !== undefined), 'Indica qué quieres cambiar.');

export const esquemaSuscripcionPush = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(500),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
});

// Etiquetas de la Fase 1 (sección 4.2): las de un negocio y las de un reciclador son distintas
export const ETIQUETAS_CALIFICACION = {
  NEGOCIO: [
    { codigo: 'puntual', nombre: 'Puntual' },
    { codigo: 'pago_lo_acordado', nombre: 'Pagó lo acordado' },
    { codigo: 'buen_trato', nombre: 'Buen trato' },
    { codigo: 'peso_frente_a_mi', nombre: 'Pesó frente a mí' },
    { codigo: 'precio_justo', nombre: 'Precio justo' },
    { codigo: 'atencion_rapida', nombre: 'Atención rápida' },
  ],
  RECICLADOR: [
    { codigo: 'material_limpio', nombre: 'Material limpio' },
    { codigo: 'bien_separado', nombre: 'Bien separado' },
    { codigo: 'puntual', nombre: 'Puntual' },
    { codigo: 'peso_correcto', nombre: 'Peso correcto' },
    { codigo: 'buen_trato', nombre: 'Buen trato' },
  ],
} as const;
