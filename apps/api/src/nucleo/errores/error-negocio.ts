import type { CampoConError } from '@reciclomap/shared';

// Error esperado: una regla del producto impide la acción
export class ErrorNegocio extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number = 422,
    readonly campos?: CampoConError[],
  ) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}
