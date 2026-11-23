import { z } from 'zod';

// Fase 12A: administración de usuarios, avisos, auditoría y panel. Toda decisión lleva motivo y confirmación explícita
const nota = (minimo: number, maximo: number) =>
  z
    .string()
    .trim()
    .min(minimo, `Escribe el motivo (mínimo ${minimo} letras).`)
    .max(maximo, `Máximo ${maximo} caracteres.`);

export const MOTIVOS_SUSPENSION = [
  'Información falsa',
  'Reportes reiterados',
  'Suplantación de identidad',
  'Incumplimiento de acuerdos',
  'Otro motivo',
] as const;
export type MotivoSuspension = (typeof MOTIVOS_SUSPENSION)[number];

const confirmar = z.literal(true, { error: 'Confirma la acción antes de continuar.' });

export const esquemaSuspender = z.object({
  motivo: z.enum(MOTIVOS_SUSPENSION, { error: 'Elige un motivo.' }),
  nota: nota(5, 150),
  confirmar,
});
export const esquemaReactivar = z.object({ motivo: nota(5, 200), confirmar });
export const esquemaModerarAviso = z.object({ motivo: nota(5, 200), confirmar });

export const ROLES_FILTRO = ['todos', 'RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL', 'ADMIN'] as const;
export const SITUACIONES_FILTRO = ['todas', 'activas', 'suspendidas', 'pendientes'] as const;
export const esquemaListaUsuarios = z.object({
  rol: z.enum(ROLES_FILTRO).default('todos'),
  situacion: z.enum(SITUACIONES_FILTRO).default('todas'),
  ciudad: z.coerce.number().int().positive().max(32767).optional(),
  q: z.string().trim().max(60).optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

export const FILTROS_AVISOS_ADMIN = ['activos', 'ocultos', 'todos'] as const;
export const esquemaListaAvisosAdmin = z.object({
  estado: z.enum(FILTROS_AVISOS_ADMIN).default('activos'),
  q: z.string().trim().max(60).optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

export const TIPOS_AUDITORIA = [
  'VERIFICACION',
  'PRECIOS',
  'USUARIOS',
  'REPORTES',
  'PLAN',
  'AVISOS',
  'PARAMETROS',
  'PREMIOS',
  'CIUDADES',
  'CONFIGURACION',
] as const;
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida.');
export const esquemaListaAuditoria = z.object({
  tipo: z.enum(TIPOS_AUDITORIA).optional(),
  admin: z.uuid().optional(),
  accion: z.string().trim().max(60).optional(),
  entidad: z.string().trim().max(40).optional(),
  q: z.string().trim().max(60).optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

export const esquemaPaginaPrivacidad = z.object({ pagina: z.coerce.number().int().min(1).max(500).default(1) });

export const PERIODOS_PANEL = [7, 30, 90] as const;
export type PeriodoPanel = (typeof PERIODOS_PANEL)[number];
export const esquemaPeriodoPanel = z.object({
  periodo: z.coerce
    .number()
    .refine(
      (valor): valor is PeriodoPanel => (PERIODOS_PANEL as readonly number[]).includes(valor),
      'Elige 7, 30 o 90 días.',
    )
    .default(30),
});

export const TEXTO_TIPO_AUDITORIA: Record<(typeof TIPOS_AUDITORIA)[number], string> = {
  VERIFICACION: 'Verificaciones',
  PRECIOS: 'Precios',
  USUARIOS: 'Usuarios',
  REPORTES: 'Reportes',
  PLAN: 'Plan Pro',
  AVISOS: 'Avisos',
  PARAMETROS: 'Parámetros',
  PREMIOS: 'Premios',
  CIUDADES: 'Ciudades',
  CONFIGURACION: 'Configuración',
};

// Fase 12B: parámetros, ciudades y zonas, premios y entregas
const motivo = z.string().trim().min(5, 'Escribe el motivo (mínimo 5 letras).').max(200, 'Máximo 200 caracteres.');

export const esquemaCambiarParametro = z.object({
  valor: z.coerce.number({ error: 'Escribe un número.' }),
  motivo,
  // Los que afectan el costo de los premios exigen una confirmación más
  confirmarCosto: z.boolean().optional(),
});

export const esquemaNuevaCiudad = z.object({
  nombre: z.string().trim().min(3, 'Mínimo 3 letras.').max(60),
  region: z.string().trim().min(3, 'Mínimo 3 letras.').max(60),
  motivo,
});
export const esquemaZona = z.object({
  nombre: z.string().trim().min(3, 'Mínimo 3 letras.').max(80),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  motivo,
});
export const esquemaRequisitosCiudad = z.object({
  verificadoresAsignados: z.boolean().optional(),
  preciosBaseCargados: z.boolean().optional(),
  motivo,
});
export const esquemaDecisionAdmin = z.object({
  motivo,
  confirmar: z.literal(true, { error: 'Confirma la acción antes de continuar.' }),
});

export const TIPOS_PREMIO = ['PUNTOS', 'OBJETO', 'SIN_PREMIO'] as const;
export const TEXTO_TIPO_PREMIO: Record<(typeof TIPOS_PREMIO)[number], string> = {
  PUNTOS: 'Puntos de bono',
  OBJETO: 'Objeto',
  SIN_PREMIO: 'Sigue intentando',
};
export const esquemaPremioCatalogo = z
  .object({
    id: z.uuid().optional(),
    nombre: z.string().trim().min(3, 'Mínimo 3 letras.').max(60),
    tipo: z.enum(TIPOS_PREMIO, { error: 'Solo puntos de bono, objeto o «Sigue intentando».' }),
    puntos: z.number().int().min(1).max(1000).nullable().optional(),
    probabilidad: z.number().min(0, 'No puede ser negativa.').max(100, 'No puede pasar de 100 %.'),
    stock: z.number().int().min(0, 'El stock no puede ser negativo.').max(100000).nullable().optional(),
    patrocinador: z.string().trim().max(80).nullable().optional(),
    puntoEntrega: z.string().trim().min(3).max(160).nullable().optional(),
    vigenciaCanjeDias: z
      .number()
      .int()
      .min(1, 'Entre 1 y 90 días.')
      .max(90, 'Entre 1 y 90 días.')
      .nullable()
      .optional(),
    vigenteDesde: z.string().datetime({ offset: true }).nullable().optional(),
    vigenteHasta: z.string().datetime({ offset: true }).nullable().optional(),
    activo: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === 'PUNTOS' && !p.puntos)
      ctx.addIssue({ code: 'custom', path: ['puntos'], message: 'Indica cuántos puntos de bono da.' });
    if (p.tipo === 'OBJETO' && (!p.puntoEntrega || !p.vigenciaCanjeDias)) {
      ctx.addIssue({
        code: 'custom',
        path: ['puntoEntrega'],
        message: 'Un objeto necesita punto de entrega y plazo de reclamo.',
      });
    }
    if (p.tipo !== 'PUNTOS' && p.puntos)
      ctx.addIssue({ code: 'custom', path: ['puntos'], message: 'Solo los premios de puntos llevan puntos.' });
    if (p.vigenteDesde && p.vigenteHasta && p.vigenteDesde >= p.vigenteHasta) {
      ctx.addIssue({ code: 'custom', path: ['vigenteHasta'], message: 'La campaña debe terminar después de empezar.' });
    }
  });
export const esquemaGuardarCatalogo = z.object({ premios: z.array(esquemaPremioCatalogo).min(2).max(20), motivo });
export const esquemaReponerStock = z.object({ cantidad: z.number().int().min(1).max(100000), motivo });
export const esquemaEntregarPremio = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^RM-[A-Z0-9]{4}$/, 'El código tiene la forma RM-XXXX.'),
  nota: z.string().trim().max(150).optional(),
});
export const FILTROS_ENTREGAS = ['por-entregar', 'por-vencer', 'entregados', 'vencidos'] as const;
export const esquemaListaEntregas = z.object({ estado: z.enum(FILTROS_ENTREGAS).default('por-entregar') });
