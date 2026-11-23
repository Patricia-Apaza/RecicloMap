import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { esquemaBuscarDireccion } from '@reciclomap/shared';
import type { z } from 'zod';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { Geocodificador } from './geocodificador.service.js';

// Búsqueda de direcciones para colocar un pin (registro de negocio, datos del local, punto de encuentro)
@ApiTags('Direcciones')
@Controller('direcciones')
export class DireccionesController {
  constructor(private readonly geocodificador: Geocodificador) {}

  @Get('buscar')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Busca una dirección en Perú (solo al tocar «Buscar», sin autocompletar)',
    description:
      'Pasa por el servidor: Nominatim recibe solo el texto, con la identidad de RecicloMap y como máximo 1 solicitud por segundo para toda la app; los resultados se guardan en caché 24 horas.',
  })
  @ApiOkResponse({
    schema: {
      example: { resultados: [{ nombre: 'Jirón Moquegua 450, Juliaca, Puno, Perú', lat: -15.4927, lng: -70.1342 }] },
    },
  })
  @ApiBadRequestResponse({ description: 'El texto debe tener entre 3 y 120 caracteres' })
  @ApiServiceUnavailableResponse({ description: 'El servicio de búsqueda no respondió (BUSQUEDA_NO_DISPONIBLE)' })
  async buscar(@Query(new ValidarCon(esquemaBuscarDireccion)) consulta: z.infer<typeof esquemaBuscarDireccion>) {
    return { resultados: await this.geocodificador.buscar(consulta.q) };
  }
}
