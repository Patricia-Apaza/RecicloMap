import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaPrecios, esquemaUbicacionNegocio, type PreciosNegocio } from '@reciclomap/shared';
import { z } from 'zod';
import {
  NegocioVerificado,
  PermiteEstados,
  Roles,
  UsuarioActual,
  type UsuarioSesion,
} from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { PreciosService } from './precios.service.js';

const esquemaGuardar = z.object({ precios: esquemaPrecios });

@ApiTags('Mi negocio · Precios')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo el dueño del negocio. La administración no puede cambiar precios' })
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@Controller('mi-negocio')
export class PreciosController {
  constructor(private readonly precios: PreciosService) {}

  @Get('precios')
  @PermiteEstados('ACTIVO', 'SUSPENDIDO')
  @ApiOperation({
    summary: 'Mis precios por material, con el semáforo frente al mercado a 5 km y la moderación vigente (pantalla 43)',
  })
  @ApiOkResponse()
  misPrecios(@UsuarioActual() usuario: UsuarioSesion) {
    return this.precios.misPrecios(usuario);
  }

  @Put('precios')
  @NegocioVerificado()
  @ApiOperation({
    summary: 'Única ruta que cambia un precio. Los materiales que no se envían dejan de comprarse',
    description:
      'Rango de S/ 0.10 a S/ 50.00 por kg, mínimo menor o igual al máximo. Cada cambio queda en el historial.',
  })
  @CuerpoZod(esquemaGuardar, {
    precios: { pet: { min: 0.8, max: 1.2, demanda: 'ALTA' }, carton: { min: 0.3, max: 0.5, demanda: 'MEDIA' } },
  })
  guardar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaGuardar)) cuerpo: { precios: PreciosNegocio },
  ) {
    return this.precios.guardar(usuario, cuerpo.precios);
  }

  @Get('precios/historial')
  @PermiteEstados('ACTIVO', 'SUSPENDIDO')
  @ApiOperation({ summary: 'Historial de mis cambios de precio (los 30 más recientes)' })
  historial(@UsuarioActual() usuario: UsuarioSesion) {
    return this.precios.historial(usuario);
  }

  @Put('ubicacion')
  @PermiteEstados('ACTIVO')
  @ApiOperation({
    summary: 'Coloca el pin del centro en el mapa (una sola vez; los centros registrados antes de la Fase 5)',
  })
  @CuerpoZod(esquemaUbicacionNegocio, { ubicacion: { lat: -15.4935, lng: -70.1355 } })
  @ApiConflictResponse({ description: 'El pin ya estaba colocado' })
  colocarPin(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaUbicacionNegocio)) cuerpo: z.infer<typeof esquemaUbicacionNegocio>,
  ) {
    return this.precios.colocarPin(usuario, cuerpo.ubicacion);
  }
}
