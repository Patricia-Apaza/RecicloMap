import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { ConsultaZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publica } from '../../nucleo/seguridad/decoradores.js';
import { CatalogosService } from './catalogos.service.js';

const esquemaCiudad = z.coerce.number().int().positive().optional();

// Datos públicos de referencia; los usa también el invitado
@ApiTags('Catálogos')
@Publica()
@Controller()
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Get('materiales')
  @ApiOperation({ summary: 'Los cinco materiales' })
  @ApiOkResponse({ schema: { example: { datos: [{ id: 1, codigo: 'pet', nombre: 'PET' }] } } })
  async materiales() {
    return { datos: await this.catalogos.materiales() };
  }

  @Get('ciudades')
  @ApiOperation({ summary: 'Ciudades y si están activas o próximamente' })
  @ApiOkResponse({ schema: { example: { datos: [{ id: 1, nombre: 'Juliaca', region: 'Puno', estado: 'ACTIVA' }] } } })
  async ciudades() {
    return { datos: await this.catalogos.ciudades() };
  }

  @Get('ciudades/:id/zonas')
  @ApiOperation({ summary: 'Zonas de una ciudad, para la zona manual y la zona de trabajo' })
  @ApiOkResponse({ schema: { example: { datos: [{ id: 1, nombre: 'Barrio Santa Rosa' }] } } })
  @ApiNotFoundResponse({ description: 'La ciudad no existe' })
  async zonas(@Param('id', ParseIntPipe) ciudadId: number) {
    return { datos: await this.catalogos.zonas(ciudadId) };
  }

  @Get('precios/referencia')
  @ApiOperation({
    summary: 'Mínimo y máximo reales por material en la ciudad, entre negocios verificados (pantalla 01)',
  })
  @ConsultaZod('ciudad', esquemaCiudad, 'Por defecto, la ciudad activa')
  @ApiOkResponse({
    schema: {
      example: {
        ciudad: { id: 1, nombre: 'Juliaca' },
        materiales: [{ codigo: 'pet', nombre: 'PET', min: '1.90', max: '3.00', negocios: 9 }],
      },
    },
  })
  referencia(@Query('ciudad', new ValidarCon(esquemaCiudad)) ciudad: number | undefined) {
    return this.catalogos.referencia(ciudad);
  }

  @Get('configuracion-publica')
  @ApiOperation({ summary: 'Radios, días de "precio al día", límites de precio y la clave pública de Google Maps' })
  configuracionPublica() {
    return this.catalogos.configuracionPublica();
  }
}
