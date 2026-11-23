import { z } from 'zod';
import { esquemaCodigo } from './acceso.js';

// Se sube al cambiar los textos legales: todos deben aceptarlos de nuevo antes de seguir
export const VERSION_TEXTOS_LEGALES = '2026-12-b';
export const TIPOS_TEXTO_LEGAL = ['TERMINOS', 'PRIVACIDAD'] as const;
export type TipoTextoLegal = (typeof TIPOS_TEXTO_LEGAL)[number];

export const ELIMINACION_GRACIA_DIAS = 7;
export const EXPORTACIONES_POR_DIA = 1;

// Plazos de depuración (días) de los datos que no son del producto; los de operaciones y auditoría están en la documentación
export const RETENCION_DIAS = {
  codigosUsados: 1,
  codigosVencidos: 1,
  sesionesVencidas: 30,
  notificacionesLeidas: 90,
  notificacionesSinLeer: 180,
  visitas: 120,
  solicitudesLlegada: 180,
  listaEsperaAvisada: 90,
  archivosHuerfanos: 7,
} as const;

const contrasena = z.string({ error: 'Escribe tu contraseña.' }).min(1, 'Escribe tu contraseña.').max(128);

// Quien entra solo con Google no tiene contraseña: confirma con el código que llega a su teléfono verificado
const contrasenaOpcional = contrasena.optional();
export const esquemaExportarDatos = z.object({ contrasena: contrasenaOpcional, codigo: esquemaCodigo.optional() });
export const esquemaPedirCodigoAccion = z.object({ contrasena: contrasenaOpcional });
export const esquemaPedirCodigoEliminacion = esquemaPedirCodigoAccion;
export const esquemaEliminarCuenta = z.object({
  contrasena: contrasenaOpcional,
  codigo: esquemaCodigo,
  entiendo: z.literal(true, { error: 'Confirma que entiendes qué pasará con tu cuenta.' }),
});
export const esquemaAceptarTextos = z.object({
  version: z.literal(VERSION_TEXTOS_LEGALES, { error: 'Los textos cambiaron. Vuelve a leerlos.' }),
  aceptaTerminos: z.literal(true, { error: 'Debes aceptar los términos y la política de privacidad.' }),
});

export const BLOQUEOS_ELIMINACION = ['operaciones', 'incidencias', 'entregas_directas', 'premios'] as const;
export type BloqueoEliminacion = (typeof BLOQUEOS_ELIMINACION)[number];
export const TEXTO_BLOQUEO: Record<BloqueoEliminacion, { titulo: string; que: string; donde: string }> = {
  operaciones: {
    titulo: 'Operaciones en curso',
    que: 'Termina o cancela las operaciones que siguen abiertas.',
    donde: '/operaciones',
  },
  incidencias: {
    titulo: 'Incidencias abiertas',
    que: 'Espera la resolución de la administración sobre tus incidencias.',
    donde: '/operaciones',
  },
  entregas_directas: {
    titulo: 'Entregas directas pendientes',
    que: 'Espera la confirmación del negocio o deja que venzan.',
    donde: '/puntos/entregas',
  },
  premios: {
    titulo: 'Premios por reclamar o por entregar',
    que: 'Reclama y recoge tus premios, o espera a que venzan.',
    donde: '/puntos/premios',
  },
};
