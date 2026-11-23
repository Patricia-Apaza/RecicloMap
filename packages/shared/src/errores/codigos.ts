export const CODIGOS_ERROR = {
  ENTRADA_NO_VALIDA: 'ENTRADA_NO_VALIDA',
  NO_AUTENTICADO: 'NO_AUTENTICADO',
  SIN_PERMISO: 'SIN_PERMISO',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  CONFLICTO: 'CONFLICTO',
  REGLA_DE_NEGOCIO: 'REGLA_DE_NEGOCIO',
  DEMASIADAS_SOLICITUDES: 'DEMASIADAS_SOLICITUDES',
  ERROR_INTERNO: 'ERROR_INTERNO',
} as const;

export type CodigoError = (typeof CODIGOS_ERROR)[keyof typeof CODIGOS_ERROR];

export type CampoConError = { campo: string; mensaje: string };

export type RespuestaError = {
  error: {
    codigo: string;
    mensaje: string;
    campos?: CampoConError[];
    idSolicitud?: string;
  };
};
