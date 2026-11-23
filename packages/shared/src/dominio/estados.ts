export const ROLES = ['RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL', 'ADMIN'] as const;
export type Rol = (typeof ROLES)[number];

export const CODIGOS_MATERIAL = ['pet', 'carton', 'papel', 'plastico', 'metal'] as const;
export type CodigoMaterial = (typeof CODIGOS_MATERIAL)[number];

export const SEMAFOROS = ['MEJOR', 'INTERMEDIO', 'BAJO', 'SIN_COMPARACION'] as const;
export type Semaforo = (typeof SEMAFOROS)[number];

export const DEMANDAS = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type Demanda = (typeof DEMANDAS)[number];

export const TRAMOS_DISTANCIA = ['menos de 1 km', '1–2 km', '2–5 km', 'más de 5 km'] as const;
export type TramoDistancia = (typeof TRAMOS_DISTANCIA)[number];

export const ESTADOS_PUBLICACION = [
  'DISPONIBLE',
  'CON_OFERTAS',
  'EN_NEGOCIACION',
  'FINALIZADA',
  'CANCELADA',
  'VENCIDA',
] as const;
export type EstadoPublicacion = (typeof ESTADOS_PUBLICACION)[number];

export const ESTADOS_OFERTA = ['PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'NO_SELECCIONADA', 'RETIRADA'] as const;
export type EstadoOferta = (typeof ESTADOS_OFERTA)[number];

export const ESTADOS_OPERACION = [
  'ACEPTADA',
  'EN_COORDINACION',
  'ENTREGADA',
  'CONFIRMADA',
  'COMPLETADA',
  'CANCELADA',
] as const;
export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];

export const ESTADOS_VERIFICACION = ['EN_REVISION', 'INFO_PEDIDA', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoVerificacion = (typeof ESTADOS_VERIFICACION)[number];

export const DISPONIBILIDADES = ['DISPONIBLE', 'EN_RUTA', 'FUERA_DE_SERVICIO'] as const;
export type Disponibilidad = (typeof DISPONIBILIDADES)[number];

export const PLANES = ['GRATIS', 'PRO'] as const;
export type Plan = (typeof PLANES)[number];
