import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { esquemaPosicion } from '@reciclomap/shared';
import type { Request } from 'express';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { Punto } from './mapa.repositorio.js';

export type UbicacionSolicitud = { posicion?: Punto; zonaId?: number };

export const CABECERA_POSICION = {
  name: 'X-Posicion',
  required: false,
  description:
    'Posición aproximada "lat,lng", redondeada a 3 decimales (unos 100 m). Se usa solo para calcular distancias.',
  example: '-15.497,-70.133',
};
export const CABECERA_ZONA = {
  name: 'X-Zona',
  required: false,
  description: 'Zona elegida a mano si no se comparte la posición.',
  example: '2',
};

// La posición viaja en X-Posicion ("lat,lng" redondeado) o la zona en X-Zona; nunca en la URL ni en los registros
export const Ubicacion = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UbicacionSolicitud => {
  const solicitud = contexto.switchToHttp().getRequest<Request>();
  const posicion = solicitud.headers['x-posicion'];
  const zona = solicitud.headers['x-zona'];
  const resultado: UbicacionSolicitud = {};
  if (typeof posicion === 'string' && posicion) {
    const lectura = esquemaPosicion.safeParse(posicion);
    if (!lectura.success) throw new ErrorNegocio('POSICION_NO_VALIDA', 'La posición enviada no es válida.', 400);
    resultado.posicion = lectura.data;
  }
  if (typeof zona === 'string' && zona) {
    const id = Number(zona);
    if (!Number.isInteger(id) || id <= 0)
      throw new ErrorNegocio('ZONA_NO_VALIDA', 'La zona enviada no es válida.', 400);
    resultado.zonaId = id;
  }
  return resultado;
});
