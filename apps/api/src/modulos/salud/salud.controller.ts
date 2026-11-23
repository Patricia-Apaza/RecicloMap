import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Publica } from '../../nucleo/seguridad/decoradores.js';
import { SaludService } from './salud.service.js';

@ApiTags('Salud')
@SkipThrottle()
@Publica()
@Controller('salud')
export class SaludController {
  constructor(private readonly salud: SaludService) {}

  @Get()
  @ApiOperation({ summary: 'Indica si el proceso de la API está vivo' })
  @ApiOkResponse({ schema: { example: { estado: 'ok' } } })
  vivo(): { estado: 'ok' } {
    return { estado: 'ok' };
  }

  @Get('listo')
  @ApiOperation({ summary: 'Indica si la API puede atender: comprueba la base de datos' })
  @ApiOkResponse({ schema: { example: { estado: 'ok', baseDatos: 'ok' } } })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no responde' })
  async listo(): Promise<{ estado: 'ok'; baseDatos: 'ok' }> {
    if (!(await this.salud.baseDatosResponde())) {
      throw new ServiceUnavailableException();
    }
    return { estado: 'ok', baseDatos: 'ok' };
  }
}
