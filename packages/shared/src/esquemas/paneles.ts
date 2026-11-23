import { z } from 'zod';
import { esquemaCoordenada } from './negocio.js';

// Avisos del negocio: informativos y cortos; igual para Gratis y Pro (Fase 9)
export const TIPOS_AVISO = ['PROMOCION', 'ANUNCIO', 'NECESIDAD', 'CAMPANA'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];
export const TEXTO_TIPO_AVISO: Record<TipoAviso, string> = {
  PROMOCION: 'Promoción',
  ANUNCIO: 'Anuncio',
  NECESIDAD: 'Necesidad',
  CAMPANA: 'Campaña',
};
export const AVISO_TITULO_MAX = 60;
export const AVISO_MENSAJE_MAX = 140;
export const AVISO_VIGENCIA_DIAS_DEFECTO = 7;

const SEPARADORES_ENTRE_DIGITOS = /(?<=\d)[\s.\-()]+(?=\d)/g;
const PATRON_ENLACE =
  /(https?:\/\/|www\.|\bwa\.me\b|\bbit\.ly\b|\b[a-z0-9-]+\.(com|pe|org|net|io|gob|edu|me|co|ly|app|link|site|info)\b|@[a-z0-9_.-]+)/i;
const PATRONES_PRECIO = [
  /s\s*\/\s*\.?\s*\d/i,
  /\bs\/\b/i,
  /\d+([.,]\d+)?\s*(soles|sol|céntimos|centimos)\b/i,
  /\b(soles|sol)\s*\d/i,
  /\$\s*\d/,
  /\d+([.,]\d+)?\s*(por|x|el|\/)\s*(kg|kilo|kilos)\b/i,
];

// Los avisos informan; los precios, teléfonos y enlaces tienen su lugar en la ficha del negocio
export function motivoAvisoNoPermitido(texto: string): string | null {
  if (PATRON_ENLACE.test(texto)) return 'No incluyas enlaces ni correos: los recicladores te encuentran en tu ficha.';
  const compacto = texto.replace(SEPARADORES_ENTRE_DIGITOS, '');
  if (/\d{7,}/.test(compacto) || /\+\s*51/.test(texto))
    return 'No incluyas teléfonos: tu WhatsApp ya está en tu ficha.';
  if (PATRONES_PRECIO.some((patron) => patron.test(texto))) {
    return 'No incluyas precios: se actualizan en Precios y demanda.';
  }
  return null;
}

const textoAviso = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Máximo ${maximo} caracteres.`)
    .superRefine((valor, contexto) => {
      const motivo = motivoAvisoNoPermitido(valor);
      if (motivo) contexto.addIssue({ code: 'custom', message: motivo });
    });

export const esquemaAviso = z.object({
  tipo: z.enum(TIPOS_AVISO, { error: 'Elige un tipo de aviso.' }),
  titulo: textoAviso(AVISO_TITULO_MAX).refine((valor) => valor.length >= 3, 'Escribe un título de al menos 3 letras.'),
  mensaje: textoAviso(AVISO_MENSAJE_MAX).optional().nullable(),
  vigenciaDias: z.coerce.number().int().min(1, 'Elige cuántos días dura.').max(60).default(AVISO_VIGENCIA_DIAS_DEFECTO),
});

export const esquemaFiltroAvisos = z.object({
  tipo: z.enum(TIPOS_AVISO).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
});

// Día del comprador móvil: ruta de hoy y posición aproximada, ambas caducan al terminar el día en Lima
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe la hora como 08:00.');
export const MAXIMO_PARADAS = 8;
export const esquemaRutaDia = z.object({
  publicar: z.boolean(),
  paradas: z
    .array(
      z
        .object({ zonaId: z.number().int().max(32767).positive(), desde: hora, hasta: hora })
        .refine((parada) => parada.hasta > parada.desde, {
          message: 'La hora final debe ser posterior a la inicial.',
          path: ['hasta'],
        }),
    )
    .max(MAXIMO_PARADAS, `Hasta ${MAXIMO_PARADAS} zonas por día.`)
    .refine((lista) => new Set(lista.map((p) => p.zonaId)).size === lista.length, 'Hay zonas repetidas.'),
});
export type RutaDia = z.infer<typeof esquemaRutaDia>;

export const esquemaPosicionDia = z
  .object({ comparte: z.boolean(), posicion: esquemaCoordenada.optional().nullable() })
  .refine((datos) => !datos.comparte || Boolean(datos.posicion), {
    message: 'Para compartir tu posición hace falta tu ubicación.',
    path: ['posicion'],
  });

// Estadísticas del negocio (50 y 53): 90 días, horas y materiales consultados son del plan Pro
export const PERIODOS_ESTADISTICAS = [7, 30, 90] as const;
export type PeriodoEstadisticas = (typeof PERIODOS_ESTADISTICAS)[number];
export const esquemaEstadisticas = z.object({
  periodo: z.coerce
    .number()
    .refine((valor) => (PERIODOS_ESTADISTICAS as readonly number[]).includes(valor), 'Elige 7, 30 o 90 días.')
    .default(30),
});

export const esquemaVisita = z.object({
  material: z.enum(['pet', 'carton', 'papel', 'plastico', 'metal']).optional().nullable(),
});

// Alertas de posible colusión que la administración descarta con motivo
export const esquemaDescartarAlerta = z.object({
  tipo: z.enum(['PAR', 'PESO']),
  clave: z.string().trim().min(3).max(80),
  motivo: z.string().trim().min(5, 'Escribe el motivo (se registra).').max(300, 'Máximo 300 caracteres.'),
});
