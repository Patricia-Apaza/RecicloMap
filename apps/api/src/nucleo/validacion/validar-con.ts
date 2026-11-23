import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Valida la entrada con un esquema compartido; el filtro de errores da formato al fallo
export class ValidarCon<Salida> implements PipeTransform<unknown, Salida> {
  constructor(private readonly esquema: ZodType<Salida>) {}

  transform(valor: unknown): Salida {
    return this.esquema.parse(valor);
  }
}
