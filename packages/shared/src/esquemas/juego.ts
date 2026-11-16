import { z } from 'zod';
import { CODIGOS_MATERIAL } from '../dominio/estados.js';
import { esquemaKilos } from './publicaciones.js';

// Fase 10A: entrega directa (RN-15), ranking, desafíos mensuales
export const ALCANCES_RANKING = ['mes', 'acumulado'] as const;
export type AlcanceRanking = (typeof ALCANCES_RANKING)[number];
export const TEXTO_ALCANCE_RANKING: Record<AlcanceRanking, string> = { mes: 'Este mes', acumulado: 'Total' };

export const ESTADOS_ENTREGA_DIRECTA = ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'VENCIDO'] as const;
export type EstadoEntregaDirecta = (typeof ESTADOS_ENTREGA_DIRECTA)[number];
export const TEXTO_ENTREGA_DIRECTA: Record<EstadoEntregaDirecta, string> = {
  PENDIENTE: 'Por confirmar',
  CONFIRMADO: 'Confirmada',
  RECHAZADO: 'Rechazada',
  VENCIDO: 'Venció',
};

export const esquemaRanking = z.object({
  alcance: z.enum(ALCANCES_RANKING).default('mes'),
  ciudad: z.coerce.number().int().positive().max(32767).optional(),
});

// Pantalla de registro directo: sin publicación previa; la fecha es hoy salvo que se indique otra de los últimos 7 días
export const esquemaEntregaDirecta = z.object({
  compradorId: z.uuid({ error: 'Elige el negocio.' }),
  material: z.enum(CODIGOS_MATERIAL, { error: 'Elige un material.' }),
  kg: esquemaKilos,
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida.')
    .optional(),
});
export type EntregaDirecta = z.infer<typeof esquemaEntregaDirecta>;

export const esquemaConfirmarEntrega = z.object({ kg: esquemaKilos });
export const esquemaRechazarEntrega = z.object({
  motivo: z.string().trim().min(5, 'Cuéntanos brevemente el motivo.').max(200, 'Máximo 200 caracteres.'),
});
export const esquemaFiltroEntregas = z.object({
  estado: z.enum(['pendientes', 'todas']).default('pendientes'),
});
