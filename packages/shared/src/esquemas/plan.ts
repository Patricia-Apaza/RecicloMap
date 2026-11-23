import { z } from 'zod';

// Fase 11: plan Pro. Lo activa la administración a mano; no hay pasarela de pago ni precios
export const LARGO_MENSAJE_PLAN = 200;

export const esquemaSolicitudPlan = z.object({
  mensaje: z
    .string()
    .trim()
    .max(LARGO_MENSAJE_PLAN, `Máximo ${LARGO_MENSAJE_PLAN} caracteres.`)
    .optional()
    .transform((valor) => valor || undefined),
});
export type SolicitudPlanDatos = z.infer<typeof esquemaSolicitudPlan>;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida.');
const motivo = z.string().trim().min(5, 'Escribe el motivo (mínimo 5 letras).').max(200, 'Máximo 200 caracteres.');

export const esquemaActivarPlan = z
  .object({ desde: fecha, hasta: fecha, motivo })
  .refine((datos) => datos.desde <= datos.hasta, {
    path: ['hasta'],
    message: 'La fecha de fin no puede ser anterior al inicio.',
  });
export type ActivarPlan = z.infer<typeof esquemaActivarPlan>;

export const esquemaMotivoPlan = z.object({ motivo });

export const FILTROS_COLA_PLAN = ['pendientes', 'resueltas'] as const;
export const esquemaColaPlan = z.object({ estado: z.enum(FILTROS_COLA_PLAN).default('pendientes') });
export const esquemaBuscarNegocioPlan = z.object({ q: z.string().trim().max(60).optional() });

export const ESTADOS_SOLICITUD_PLAN = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA'] as const;
export type EstadoSolicitudPlan = (typeof ESTADOS_SOLICITUD_PLAN)[number];
export const TEXTO_SOLICITUD_PLAN: Record<EstadoSolicitudPlan, string> = {
  PENDIENTE: 'Solicitado',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
};
export const TEXTO_ACCION_PLAN = {
  ACTIVADO: 'Plan Pro activado',
  DESACTIVADO: 'Plan Pro desactivado',
  VENCIDO: 'Plan Pro vencido',
} as const;
