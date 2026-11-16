import type {
  CodigoMaterial,
  EstadoOferta,
  EstadoOperacion,
  EstadoPublicacion,
  TramoDistancia,
} from '@reciclomap/shared';

export type MaterialRef = { codigo: CodigoMaterial; nombre: string };
export type CalificacionPublica = { promedio: string | null; cantidad: number; nuevo: boolean };

export type Publicacion = {
  id: string;
  estado: EstadoPublicacion;
  material: MaterialRef;
  kg: number;
  precioEsperado: string | null;
  nota: string | null;
  fotos: string[];
  creadaEn: string;
  venceEn: string;
  diasRestantes: number;
  motivoCancelacion: string | null;
  ofertas: { total: number; pendientes: number; mejorPrecioKg: string | null };
  operacion: { id: string; estado: EstadoOperacion } | null;
};

export type MisPublicaciones = {
  indicadores: { activas: number; ofertasSinResponder: number; kgActivos: number; porVencer: number };
  conteos: Record<'activas' | 'finalizadas' | 'vencidas' | 'canceladas', number>;
  datos: Publicacion[];
};

export type DetallePublicacion = Publicacion & {
  editable: boolean;
  loVeran: number;
  historial: Array<{ texto: string; detalle: string; fecha: string }>;
};

export type OfertaRecibida = {
  id: string;
  estado: EstadoOferta;
  precioKg: string;
  total: string;
  mensaje: string | null;
  cuandoRecoge: string | null;
  creadaEn: string;
  modificada: boolean;
  negocio: {
    id: string;
    tipo: 'CENTRO' | 'MOVIL';
    nombre: string;
    vehiculo: string | null;
    esPro: boolean;
    whatsapp: string;
    calificacion: CalificacionPublica;
    distanciaKm: number | null;
  };
};

export type OfertasRecibidas = { publicacion: Publicacion; mayorTotalId: string | null; ofertas: OfertaRecibida[] };

export type RecicladorPublico = {
  alias: string;
  ciudad: string;
  nivel: { numero: number; nombre: string };
  calificacion: CalificacionPublica;
  operaciones: number;
  confiable: boolean;
  telefonoVerificado: boolean;
};

export type MiOferta = {
  id: string;
  estado: EstadoOferta;
  precioKg: string;
  total: string;
  operacionId: string | null;
};

export type PublicacionCercana = {
  id: string;
  estado: 'DISPONIBLE';
  material: MaterialRef;
  kg: number;
  precioEsperado: string | null;
  nota: string | null;
  fotos: string[];
  creadaEn: string;
  venceEn: string;
  diasRestantes: number;
  tramo: TramoDistancia | null;
  compraEsteMaterial: boolean;
  miOferta: MiOferta | null;
  reciclador: RecicladorPublico;
};

export type DetalleCercana = PublicacionCercana & {
  miPrecio: { min: string; max: string } | null;
  resenas: Array<{
    estrellas: number;
    comentario: string | null;
    etiquetas: string[];
    autor: string;
    creadaEn: string;
  }>;
};

export type OfertaEnviada = {
  id: string;
  estado: EstadoOferta;
  precioKg: string;
  total: string;
  mensaje: string | null;
  cuandoRecoge: string | null;
  creadaEn: string;
  operacion: { id: string; estado: EstadoOperacion } | null;
  publicacion: { id: string; material: MaterialRef; kg: number; tramo: TramoDistancia | null };
};

export type OfertasEnviadas = {
  indicadores: { enviadas: number; pendientes: number; aceptadas: number; tasaAceptacion: number | null };
  conteos: Record<'todas' | 'pendientes' | 'aceptadas' | 'no-seleccionadas' | 'retiradas', number>;
  datos: OfertaEnviada[];
};

export type AccionOperacion =
  | 'coordinar'
  | 'entregar'
  | 'cancelar'
  | 'confirmar'
  | 'corregirKilos'
  | 'conforme'
  | 'noConforme'
  | 'abrirIncidencia'
  | 'calificar'
  | 'volverAPublicar'
  | 'reportarProblema';

export type Operacion = {
  id: string;
  estado: EstadoOperacion;
  enDisputa: boolean;
  rol: 'RECICLADOR' | 'NEGOCIO';
  publicacionId: string;
  material: MaterialRef;
  kg: number;
  precioKg: string;
  total: string;
  kgFinal: number | null;
  montoFinal: string | null;
  mensaje: string | null;
  cuandoRecoge: string | null;
  fechas: Record<
    | 'publicada'
    | 'ofertaRecibida'
    | 'aceptada'
    | 'coordinada'
    | 'entregada'
    | 'confirmada'
    | 'completada'
    | 'cancelada',
    string | null
  >;
  completadaPorPlazo: boolean;
  plazos: { conformidadHasta: string | null; incidenciaDesde: string | null };
  contraparte: {
    negocioId: string | null;
    tipo: 'CENTRO' | 'MOVIL' | 'RECICLADOR';
    nombre: string;
    whatsapp: string;
    direccion: string | null;
    vehiculo: string | null;
  };
  puedeEncontrarseEnElLocal: boolean;
  coordinacion: {
    tipo: 'LOCAL_DEL_CENTRO' | 'REFERENCIA';
    referencia: string | null;
    direccionDelLocal: string | null;
    pin: { lat: number; lng: number } | null;
    dia: string | null;
    franja: 'MANANA' | 'TARDE' | 'NOCHE' | null;
    mensaje: string | null;
    definidaEn: string;
  } | null;
  cancelacion: { motivo: string | null; por: 'RECICLADOR' | 'NEGOCIO' | 'ADMINISTRACION' } | null;
  incidencia: {
    estado: string;
    motivo: string;
    detalle: string | null;
    decision: string | null;
    resolucion: string | null;
    abiertaEn: string;
    correccionPedida: boolean;
  } | null;
  puntos: number | null;
  miCalificacion: { estrellas: number } | null;
  acciones: AccionOperacion[];
  puntosGanados?: number;
  girosNuevos?: number;
};

export type FilaHistorial = {
  id: string;
  fecha: string;
  estado: EstadoOperacion;
  enDisputa: boolean;
  material: MaterialRef;
  kg: number;
  kgConfirmados: boolean;
  precioKg: string;
  total: string;
  contraparte: string;
  contraparteTipo: 'CENTRO' | 'MOVIL' | 'RECICLADOR';
  puntos: number | null;
  motivoCancelacion: string | null;
  calificada: boolean;
};

export type Historial = {
  rol: 'RECICLADOR' | 'NEGOCIO';
  indicadores: {
    operaciones: number;
    enCurso: number;
    kg: number;
    monto: string;
    puntos: number | null;
    recicladores: number | null;
  };
  conteos: Record<'todas' | 'en-curso' | 'completadas' | 'canceladas', number>;
  datos: FilaHistorial[];
};

export type Resena = {
  id: string;
  autor: string;
  estrellas: number;
  comentario: string | null;
  etiquetas: string[];
  creadaEn: string;
  respuesta: { texto: string; creadaEn: string } | null;
  reportadaPorMi?: boolean;
};

export type ResumenResenas = CalificacionPublica & { distribucion: Array<{ estrellas: number; cantidad: number }> };
