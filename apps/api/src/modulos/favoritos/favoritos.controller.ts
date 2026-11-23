import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { esquemaAlertasFavorito } from '@reciclomap/shared';
import type { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { CABECERA_POSICION, CABECERA_ZONA, Ubicacion, type UbicacionSolicitud } from '../mapa/posicion.js';
import { FavoritosService } from './favoritos.service.js';

@ApiTags('Favoritos')
@ApiBearerAuth()
@Roles('RECICLADOR')
@ApiForbiddenResponse({ description: 'Solo recicladores' })
@Controller('favoritos')
export class FavoritosController {
  constructor(private readonly favoritos: FavoritosService) {}

  @Get()
  @ApiOperation({
    summary:
      'Mis favoritos con precio, semáforo (frente a todos los que compran cerca) y estado; los no visibles se marcan sin precios',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  listar(@UsuarioActual() usuario: UsuarioSesion, @Ubicacion() ubicacion: UbicacionSolicitud) {
    return this.favoritos.listar(usuario, ubicacion);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Solo los ids, para marcar el corazón en el mapa y en las fichas' })
  ids(@UsuarioActual() usuario: UsuarioSesion) {
    return this.favoritos.ids(usuario);
  }

  @Put(':compradorId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Guarda un negocio en favoritos (hasta 30). Las alertas empiezan activadas' })
  @ApiNotFoundResponse({ description: 'No existe o no está verificado' })
  @ApiUnprocessableEntityResponse({ description: 'LIMITE_FAVORITOS' })
  guardar(@UsuarioActual() usuario: UsuarioSesion, @Param('compradorId', ParseUUIDPipe) compradorId: string) {
    return this.favoritos.guardar(usuario, compradorId);
  }

  @Delete(':compradorId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quita un negocio de favoritos' })
  @ApiNoContentResponse()
  async quitar(@UsuarioActual() usuario: UsuarioSesion, @Param('compradorId', ParseUUIDPipe) compradorId: string) {
    await this.favoritos.quitar(usuario, compradorId);
  }

  @Patch(':compradorId/alertas')
  @ApiOperation({ summary: 'Alertas de este favorito: cambio de precio y avisos del negocio' })
  @CuerpoZod(esquemaAlertasFavorito, { alertaPrecio: false })
  @ApiNotFoundResponse({ description: 'No está en mis favoritos' })
  alertas(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('compradorId', ParseUUIDPipe) compradorId: string,
    @Body(new ValidarCon(esquemaAlertasFavorito)) cuerpo: z.infer<typeof esquemaAlertasFavorito>,
  ) {
    return this.favoritos.alertas(usuario, compradorId, cuerpo);
  }
}
