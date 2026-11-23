import type {
  CodigoMaterial,
  Demanda,
  Disponibilidad,
  EstadoOferta,
  EstadoOperacion,
  EstadoPublicacion,
  Plan,
  Rol,
  Semaforo,
} from './estados.js';

// El semáforo siempre se muestra con texto, nunca solo con color
export const TEXTO_SEMAFORO: Record<Semaforo, { texto: string; corto: string }> = {
  MEJOR: { texto: 'Mejor precio', corto: 'Mejor precio' },
  INTERMEDIO: { texto: 'Precio intermedio', corto: 'Intermedio' },
  BAJO: { texto: 'Precio bajo', corto: 'Precio bajo' },
  SIN_COMPARACION: { texto: 'Sin comparación', corto: 'Sin comparar' },
};

export const TEXTO_DEMANDA: Record<Demanda, string> = {
  ALTA: 'Demanda alta',
  MEDIA: 'Demanda media',
  BAJA: 'Demanda baja',
};

export const NOMBRE_MATERIAL: Record<CodigoMaterial, string> = {
  pet: 'PET',
  carton: 'Cartón',
  papel: 'Papel',
  plastico: 'Plástico duro',
  metal: 'Metales',
};

export const NOMBRE_ROL: Record<Rol, string> = {
  RECICLADOR: 'Reciclador',
  CENTRO: 'Centro de acopio',
  COMPRADOR_MOVIL: 'Comprador móvil',
  ADMIN: 'Administrador',
};

export const TEXTO_PUBLICACION: Record<EstadoPublicacion, string> = {
  DISPONIBLE: 'Disponible',
  CON_OFERTAS: 'Con ofertas',
  EN_NEGOCIACION: 'En negociación',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
};

export const TEXTO_OFERTA: Record<EstadoOferta, string> = {
  PENDIENTE: 'Esperando respuesta',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'No seleccionada',
  NO_SELECCIONADA: 'No seleccionada',
  RETIRADA: 'Retirada',
};

export const TEXTO_OPERACION: Record<EstadoOperacion, string> = {
  ACEPTADA: 'Aceptada',
  EN_COORDINACION: 'En coordinación',
  ENTREGADA: 'Entregada',
  CONFIRMADA: 'Confirmada',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

export const TEXTO_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  DISPONIBLE: 'Disponible',
  EN_RUTA: 'En ruta',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

export const NOMBRE_PLAN: Record<Plan, string> = {
  GRATIS: 'Gratis',
  PRO: 'Pro',
};

// Etiqueta del plan Pro: el mismo texto en mapa, lista, calculadora, comparar, favoritos, ofertas y ficha
export const TEXTO_DESTACADO_PRO = 'Destacado · Plan Pro';
export const AYUDA_DESTACADO_PRO =
  'Este negocio tiene el plan Pro. Es un plan, no una recomendación neutral: no cambia su precio, su semáforo ni su demanda.';
