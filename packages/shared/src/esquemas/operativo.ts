import { z } from 'zod';

const motivo = z.string().trim().min(5, 'Escribe el motivo (mínimo 5 letras).').max(200, 'Máximo 200 caracteres.');
const fecha = z.string().datetime({ offset: true, error: 'Escribe una fecha y hora válidas.' });

export const BANNER_MAXIMO = 140;
export const MENSAJE_MANTENIMIENTO_MAXIMO = 200;
export const ROLES_DE_REGISTRO = ['reciclador', 'negocio'] as const;
export type RolDeRegistro = (typeof ROLES_DE_REGISTRO)[number];

// Aviso global: texto corto con inicio y fin; sin texto se retira
export const esquemaBanner = z
  .object({
    texto: z
      .string()
      .trim()
      .min(1, 'Escribe el aviso.')
      .max(BANNER_MAXIMO, `Máximo ${BANNER_MAXIMO} caracteres.`)
      .nullable(),
    desde: fecha.nullable().optional(),
    hasta: fecha.nullable().optional(),
    motivo,
  })
  .superRefine((b, ctx) => {
    if (b.texto === null) return;
    if (!b.desde || !b.hasta)
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'Indica cuándo empieza y cuándo termina.' });
    else if (new Date(b.hasta) <= new Date(b.desde))
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'Debe terminar después de empezar.' });
    else if (new Date(b.hasta).getTime() <= Date.now())
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha final ya pasó.' });
  });

export const esquemaRegistroAbierto = z
  .object({ reciclador: z.boolean().optional(), negocio: z.boolean().optional(), motivo })
  .refine((r) => r.reciclador !== undefined || r.negocio !== undefined, { message: 'Elige qué registro cambias.' });

export const esquemaMantenimiento = z
  .object({
    activo: z.boolean(),
    mensaje: z.string().trim().min(5, 'Explica qué pasa y cuándo vuelve.').max(MENSAJE_MANTENIMIENTO_MAXIMO).optional(),
    motivo,
    confirmar: z.literal(true, { error: 'Confirma la acción antes de continuar.' }),
  })
  .refine((m) => !m.activo || Boolean(m.mensaje), {
    path: ['mensaje'],
    message: 'Escribe el mensaje que verá la gente.',
  });

// Se muestra en toda la aplicación mientras el modo demostración esté activo
export const TEXTO_DEMOSTRACION = 'Versión de demostración académica: datos de prueba; SMS y correo simulados';

export type EstadoOperativo = {
  ahora: string;
  demostracion: boolean;
  banner: { id: number; texto: string; hasta: string } | null;
  registro: { reciclador: boolean; negocio: boolean };
  mantenimiento: { activo: boolean; mensaje: string | null; desde: string | null };
};
