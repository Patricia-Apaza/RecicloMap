import type { CodigoMaterial, EstadoEntregaDirecta } from '@reciclomap/shared';

export type NivelEscalera = { numero: number; nombre: string; kgMin: number };
export type Siguiente = { nombre: string; kgMin: number; faltan: number } | null;

export type Movimiento = { id: string; descripcion: string; puntos: number; fecha: string };

export type DesafioMes = {
  id: string;
  nombre: string;
  descripcion: string;
  material: { codigo: CodigoMaterial; nombre: string } | null;
  meta: number;
  unidad: string;
  puntos: number;
  esMetaMes: boolean;
  otorgaGiro: boolean;
  progreso: number;
  estado: 'EN_PROGRESO' | 'COMPLETADO' | 'RECLAMADO';
  delMesAnterior: boolean;
  reclamableHasta: string | null;
};
export type RespuestaDesafios = { mes: string; mesTexto: string; renuevaEnDias: number; datos: DesafioMes[] };

export type RespuestaPuntos = {
  puntos: number;
  kgTotal: number;
  nivel: { numero: number; nombre: string };
  siguiente: Siguiente;
  niveles: NivelEscalera[];
  movimientos: Movimiento[];
  giros: { disponibles: number; puntosPorGiro: number; avance: number; faltan: number };
  invitacion: {
    codigo: string;
    invitados: number;
    completaron: number;
    puntosGanados: number;
    puntosPorInvitado: number;
  };
  desafios: { mes: string; items: DesafioMes[] };
};

export type RespuestaNiveles = {
  kgTotal: number;
  nivel: { numero: number; nombre: string };
  siguiente: Siguiente;
  niveles: NivelEscalera[];
  semanas: Array<{ lunes: string; kg: number }>;
};

export type InsigniaJuego = {
  codigo: string;
  nombre: string;
  categoria: 'KILOS' | 'CONSTANCIA' | 'CALIDAD' | 'PRECIO' | 'COMUNIDAD' | 'JUEGO';
  descripcion: string;
  unidad: string;
  meta: number;
  actual: number;
  lograda: boolean;
  obtenidaEn: string | null;
  destacada: boolean;
};
export type RespuestaInsignias = { logradas: number; total: number; datos: InsigniaJuego[] };

export type FilaRanking = { posicion: number; nombre: string; nivel: string; kg: number; esYo: boolean };
export type RespuestaRanking = {
  alcance: 'mes' | 'acumulado';
  ciudad: string;
  mesTexto: string;
  filas: FilaRanking[];
  yo: { visible: boolean; posicion: number | null; faltan: number | null; anterior: string | null };
};

export type RespuestaCamino = {
  nombre: string;
  ciudad: string;
  desde: string;
  nivel: { numero: number; nombre: string };
  kgTotal: number;
  operaciones: number;
  calificacion: { promedio: string | null; cantidad: number; nuevo: boolean };
  confiable: boolean;
  siguiente: { nombre: string; kgMin: number } | null;
  niveles: NivelEscalera[];
  especiales: InsigniaJuego[];
  historial: Array<{ material: string; kg: number; negocio: string; total: number | null; fecha: string }>;
};

export type EntregaReciclador = {
  id: string;
  estado: EstadoEntregaDirecta;
  material: { codigo: CodigoMaterial; nombre: string };
  kg: number;
  kgConfirmado: number | null;
  fecha: string;
  creadoEn: string;
  venceEn: string;
  negocio: string;
  puntosOtorgados: number;
  motivoRechazo: string | null;
};
export type RespuestaMisEntregas = {
  limites: { topeDiario: number; puntosHoy: number; maxPendientes: number; pendientes: number; vigenciaDias: number };
  datos: EntregaReciclador[];
};
export type EntregaNegocio = Omit<EntregaReciclador, 'negocio' | 'puntosOtorgados' | 'motivoRechazo'> & {
  reciclador: string;
  nivel: string | null;
};

// Fase 10B: giros, ruleta y premios
export type GirosResumen = { disponibles: number; puntosPorGiro: number; avance: number; faltan: number };

export type PremioRuleta = {
  id: string;
  nombre: string;
  tipo: 'PUNTOS' | 'OBJETO' | 'SIN_PREMIO';
  puntos: number | null;
  patrocinado: boolean;
  patrocinador: string | null;
  puntoEntrega: string | null;
  vigenciaCanjeDias: number | null;
  vigenteHasta: string | null;
  disponible: boolean;
  motivoNoDisponible: 'SIN_STOCK' | 'FUERA_DE_CAMPANA' | null;
  probabilidad: number;
};

export type RespuestaRuleta = {
  giros: GirosResumen;
  puedeGirar: boolean;
  enPausa: boolean;
  metaMes: {
    id: string;
    nombre: string;
    kg: number;
    metaKg: number;
    puntosBono: number;
    estado: 'EN_PROGRESO' | 'COMPLETADO' | 'RECLAMADO';
    renuevaEnDias: number;
  } | null;
  premios: PremioRuleta[];
  ultimos: Array<{ id: string; nombre: string; tipo: string; fecha: string }>;
};

export type ResultadoGiro = {
  id: string;
  repetido: boolean;
  premio: { id: string; nombre: string; tipo: PremioRuleta['tipo']; puntos: number | null; patrocinado: boolean };
  premioGanado: { id: string; estado: string; venceEn: string } | null;
  girosRestantes: number;
  puntos: number;
};

export type EstadoPremioVista = 'POR_RECLAMAR' | 'RECLAMADO' | 'ENTREGADO' | 'VENCIDO' | 'RENUNCIADO' | 'ACREDITADO';
export type PremioGanadoVista = {
  id: string;
  tipo: 'PUNTOS' | 'OBJETO';
  nombre: string;
  puntos: number | null;
  patrocinado: boolean;
  estado: EstadoPremioVista;
  codigo: string | null;
  puntoEntrega: string | null;
  venceEn: string | null;
  ganadoEn: string;
  entregadoEn: string | null;
};
export type RespuestaPremios = {
  resumen: { ganados: number; porReclamar: number; reclamados: number; entregados: number; puntosGanados: number };
  conteos: Record<'todos' | 'por-reclamar' | 'reclamados' | 'entregados' | 'puntos', number>;
  items: PremioGanadoVista[];
};
export type PremioReclamado = { id: string; nombre: string; estado: string; codigo: string; puntoEntrega: string };
