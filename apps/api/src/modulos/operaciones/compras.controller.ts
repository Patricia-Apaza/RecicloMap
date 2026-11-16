import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NegocioVerificado, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { OperacionesService } from './operaciones.service.js';

@ApiTags('Operaciones')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo centros y compradores móviles verificados' })
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@NegocioVerificado()
@Controller('negocio')
export class ComprasController {
  constructor(private readonly operaciones: OperacionesService) {}

  @Get('compras')
  @ApiOperation({ summary: 'Mis compras (pantalla 54): ofertas que esperan respuesta, compras en curso y completadas' })
  compras(@UsuarioActual() usuario: UsuarioSesion) {
    return this.operaciones.compras(usuario);
  }
}
