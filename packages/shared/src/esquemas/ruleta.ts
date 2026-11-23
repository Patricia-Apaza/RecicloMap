import { z } from 'zod';

// Fase 10B: ruleta, giros y premios
export const esquemaGirar = z.object({
  clave: z.uuid({ error: 'Falta la clave de este giro.' }),
});
export type Girar = z.infer<typeof esquemaGirar>;

export const FILTROS_PREMIOS = ['todos', 'por-reclamar', 'reclamados', 'entregados', 'puntos'] as const;
export type FiltroPremios = (typeof FILTROS_PREMIOS)[number];
export const TEXTO_FILTRO_PREMIOS: Record<FiltroPremios, string> = {
  todos: 'Todos',
  'por-reclamar': 'Por reclamar',
  reclamados: 'Reclamados',
  entregados: 'Entregados',
  puntos: 'Puntos',
};
export const esquemaFiltroPremios = z.object({
  filtro: z.enum(FILTROS_PREMIOS).default('todos'),
});

export const ESTADOS_PREMIO = [
  'POR_RECLAMAR',
  'RECLAMADO',
  'ENTREGADO',
  'VENCIDO',
  'RENUNCIADO',
  'ACREDITADO',
] as const;
export type EstadoPremio = (typeof ESTADOS_PREMIO)[number];
export const TEXTO_ESTADO_PREMIO: Record<EstadoPremio, string> = {
  POR_RECLAMAR: 'Por reclamar',
  RECLAMADO: 'Reclamado',
  ENTREGADO: 'Entregado',
  VENCIDO: 'Venció',
  RENUNCIADO: 'Renunciaste',
  ACREDITADO: 'Puntos acreditados',
};

// El azar se mide en centésimas de punto porcentual: 10 000 = 100 %
export const ESCALA_AZAR = 10_000;

export const esquemaRenunciarPremio = z.object({
  confirmar: z.literal(true, { error: 'Confirma que renuncias a este premio.' }),
});
