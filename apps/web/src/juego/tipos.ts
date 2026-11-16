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
