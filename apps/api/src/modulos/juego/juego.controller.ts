import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaRanking } from '@reciclomap/shared';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { JuegoService } from './juego.service.js';

@ApiTags('Juego')
@ApiBearerAuth()
@Roles('RECICLADOR')
@ApiForbiddenResponse({ description: 'Solo recicladores; cada uno ve únicamente lo suyo' })
@Controller()
export class JuegoController {
  constructor(private readonly juego: JuegoService) {}

  @Get('yo/puntos')
  @ApiOperation({
    summary:
      'Puntos, kilos, nivel, últimos movimientos, invitación y desafíos del mes (pantalla 30). Todo se calcula en el servidor; no incluye giros ni ruleta',
  })
  @ApiOkResponse({
    schema: { example: { puntos: 1275, kgTotal: 347, nivel: { numero: 3, nombre: 'Recolector' }, movimientos: [] } },
  })
  puntos(@UsuarioActual() usuario: UsuarioSesion) {
    return this.juego.puntos(usuario.id);
  }

  @Get('yo/niveles')
  @ApiOperation({
    summary: 'Escalera de 6 niveles por kilos acumulados y kilos de las últimas 8 semanas (pantalla 31)',
  })
  niveles(@UsuarioActual() usuario: UsuarioSesion) {
    return this.juego.niveles(usuario.id);
  }

  @Get('yo/insignias')
  @ApiOperation({ summary: 'Las 12 insignias con su progreso real y cuáles se lograron (pantallas 14 y 37)' })
  insignias(@UsuarioActual() usuario: UsuarioSesion) {
    return this.juego.insignias(usuario.id);
  }

  @Get('yo/camino')
  @ApiOperation({
    summary: 'Perfil del reciclador: nivel, kilos, operaciones, insignias especiales e historial (pantalla 14)',
  })
  camino(@UsuarioActual() usuario: UsuarioSesion) {
    return this.juego.camino(usuario.id);
  }

  @Get('yo/desafios')
  @ApiOperation({
    summary:
      'Desafíos mensuales con su progreso real (pantalla 33). Se reinician el día 1 a las 00:00 de Lima; los del mes anterior se pueden reclamar hasta 7 días después',
  })
  desafios(@UsuarioActual() usuario: UsuarioSesion) {
    return this.juego.desafios(usuario.id);
  }

  @Post('yo/desafios/:id/reclamar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reclama un desafío completado, una sola vez. Suma sus puntos de bonus, que no cuentan para ganar giros',
  })
  @ApiConflictResponse({ description: 'DESAFIO_INCOMPLETO, DESAFIO_YA_RECLAMADO o DESAFIO_FUERA_DE_PLAZO' })
  @ApiNotFoundResponse({ description: 'No existe ese desafío' })
  reclamar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.juego.reclamar(usuario.id, id);
  }

  @Get('ranking')
  @ConsultaZod('alcance', esquemaRanking.shape.alcance)
  @ConsultaZod('ciudad', esquemaRanking.shape.ciudad)
  @ApiOperation({
    summary:
      'Ranking de la ciudad, del mes o acumulado (pantalla 36): solo nombre abreviado, nivel y kilos. Quien se oculta no aparece y no se expone ningún identificador',
  })
  ranking(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaRanking)) consulta: z.infer<typeof esquemaRanking>,
  ) {
    return this.juego.ranking(usuario.id, consulta.alcance, consulta.ciudad);
  }
}
