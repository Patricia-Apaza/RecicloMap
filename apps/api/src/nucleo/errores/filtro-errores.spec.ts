import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { z } from 'zod';
import { ErrorNegocio } from './error-negocio.js';
import { traducirError } from './filtro-errores.js';

describe('traducirError', () => {
  it('respeta el código, el mensaje y el estado de un error de negocio', () => {
    const error = new ErrorNegocio('PRECIO_OBLIGATORIO', 'Falta el precio de PET.', 422, [
      { campo: 'precios.pet.min', mensaje: 'Es obligatorio.' },
    ]);
    expect(traducirError(error)).toEqual({
      estado: 422,
      codigo: 'PRECIO_OBLIGATORIO',
      mensaje: 'Falta el precio de PET.',
      campos: [{ campo: 'precios.pet.min', mensaje: 'Es obligatorio.' }],
    });
  });

  it('convierte un fallo de validación en 400 con el campo que falló', () => {
    const esquema = z.object({ cantidadKg: z.number().min(1, 'Escribe un peso entre 1 y 5 000 kg.') });
    const resultado = esquema.safeParse({ cantidadKg: 0 });
    expect(resultado.success).toBe(false);
    const traducido = traducirError(resultado.error);
    expect(traducido.estado).toBe(400);
    expect(traducido.codigo).toBe('ENTRADA_NO_VALIDA');
    expect(traducido.campos).toEqual([{ campo: 'cantidadKg', mensaje: 'Escribe un peso entre 1 y 5 000 kg.' }]);
  });

  it.each([
    [new BadRequestException(), 400, 'ENTRADA_NO_VALIDA'],
    [new UnauthorizedException(), 401, 'NO_AUTENTICADO'],
    [new ForbiddenException(), 403, 'SIN_PERMISO'],
    [new NotFoundException('Cannot GET /api/v1/x'), 404, 'NO_ENCONTRADO'],
    [new ThrottlerException(), 429, 'DEMASIADAS_SOLICITUDES'],
  ])('traduce %o a %i %s', (error, estado, codigo) => {
    const traducido = traducirError(error);
    expect(traducido.estado).toBe(estado);
    expect(traducido.codigo).toBe(codigo);
  });

  it('nunca muestra el mensaje interno del framework', () => {
    expect(traducirError(new NotFoundException('Cannot GET /api/v1/x')).mensaje).toBe('No encontramos lo que buscas.');
  });

  it('oculta el detalle de un error inesperado', () => {
    const traducido = traducirError(new Error('connect ECONNREFUSED 127.0.0.1:5433'));
    expect(traducido).toEqual({
      estado: 500,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.',
    });
  });
});
