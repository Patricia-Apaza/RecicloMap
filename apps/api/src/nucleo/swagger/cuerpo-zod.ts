import { applyDecorators } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiQuery, type SchemaObject } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

const aEsquema = (esquema: ZodType) =>
  z.toJSONSchema(esquema, { io: 'input', unrepresentable: 'any' }) as unknown as SchemaObject;

// Documenta el cuerpo con el mismo esquema que lo valida, para que Swagger nunca se desfase
export function CuerpoZod(esquema: ZodType, ejemplo?: unknown) {
  return applyDecorators(
    ApiBody({ schema: { ...aEsquema(esquema), ...(ejemplo ? { example: ejemplo } : {}) } }),
    ApiBadRequestResponse({ description: 'Datos no válidos: `error.campos` dice qué corregir' }),
  );
}

export function ConsultaZod(nombre: string, esquema: ZodType, descripcion?: string) {
  return ApiQuery({ name: nombre, required: false, schema: aEsquema(esquema), description: descripcion });
}
