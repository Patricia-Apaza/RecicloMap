import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaPedirInformacion, esquemaRechazo } from '@reciclomap/shared';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { type FiltroCola, VerificacionesService } from './verificaciones.service.js';

const esquemaFiltro = z.enum(['pendientes', 'info-pedida', 'resueltas']).default('pendientes');

@ApiTags('Administración · Verificaciones')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo administración' })
@Roles('ADMIN')
@Controller('admin/verificaciones')
export class VerificacionesController {
  constructor(private readonly verificaciones: VerificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Cola de verificación de centros y compradores móviles (pantalla 58)' })
  @ConsultaZod('estado', esquemaFiltro)
  cola(@Query('estado', new ValidarCon(esquemaFiltro)) filtro: FiltroCola) {
    return this.verificaciones.cola(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha del negocio con sus precios en solo lectura' })
  @ApiNotFoundResponse()
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.verificaciones.detalle(id);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Aprueba: el negocio aparece en el mapa (RN-18). Queda en auditoría y se avisa en la app y por SMS',
  })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'Ya estaba resuelta' })
  aprobar(@UsuarioActual() admin: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.verificaciones.aprobar(admin.id, id);
  }

  @Post(':id/rechazar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rechaza con motivo obligatorio. Queda en auditoría y se avisa en la app y por SMS' })
  @CuerpoZod(esquemaRechazo, {
    motivo: 'Dirección no verificable',
    mensaje: 'La dirección no coincide con el pin del mapa.',
  })
  @ApiConflictResponse({ description: 'Ya estaba resuelta' })
  rechazar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaRechazo)) datos: z.infer<typeof esquemaRechazo>,
  ) {
    return this.verificaciones.rechazar(admin.id, id, datos.motivo, datos.mensaje);
  }

  @Post(':id/pedir-informacion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pide completar un dato. Queda en auditoría y se avisa en la app y por SMS' })
  @CuerpoZod(esquemaPedirInformacion, { motivo: 'Falta foto del local', mensaje: 'Sube una foto de la fachada.' })
  @ApiConflictResponse({ description: 'Ya estaba resuelta' })
  pedirInformacion(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaPedirInformacion)) datos: z.infer<typeof esquemaPedirInformacion>,
  ) {
    return this.verificaciones.pedirInformacion(admin.id, id, datos.motivo, datos.mensaje);
  }
}
