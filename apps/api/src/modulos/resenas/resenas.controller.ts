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
import { esquemaReporteResena, esquemaRespuestaResena } from '@reciclomap/shared';
import { z } from 'zod';
import { Publica, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { ResenasService } from './resenas.service.js';

const esquemaFiltro = z.enum(['todas', 'sin-responder', 'bajas']).default('todas');
const EJEMPLO_RESENA = {
  id: 'c1…',
  autor: 'Marco Q.',
  estrellas: 5,
  comentario: 'Pesaron frente a mí y pagaron lo acordado.',
  etiquetas: ['Pesó frente a mí', 'Pagó lo acordado'],
  creadaEn: '2026-11-12T15:00:00.000Z',
  respuesta: null,
};
const EJEMPLO_RESUMEN = {
  promedio: '4.7',
  cantidad: 12,
  nuevo: false,
  distribucion: [
    { estrellas: 5, cantidad: 9 },
    { estrellas: 4, cantidad: 2 },
    { estrellas: 3, cantidad: 1 },
    { estrellas: 2, cantidad: 0 },
    { estrellas: 1, cantidad: 0 },
  ],
};

@ApiTags('Reseñas')
@Controller()
export class ResenasController {
  constructor(private readonly resenas: ResenasService) {}

  @Get('negocios/:id/resenas')
  @Publica()
  @ApiOperation({
    summary:
      'Reseñas públicas de un negocio (pantalla 17). Solo se listan: se crean desde una operación completada (C6)',
  })
  @ApiOkResponse({
    schema: { example: { negocio: 'Acopio Titicaca', resumen: EJEMPLO_RESUMEN, datos: [EJEMPLO_RESENA] } },
  })
  @ApiNotFoundResponse({ description: 'No existe o no está verificado' })
  publicas(@Param('id', ParseUUIDPipe) id: string) {
    return this.resenas.publicas(id);
  }

  @Get('yo/resenas')
  @ApiBearerAuth()
  @Roles('RECICLADOR')
  @ApiForbiddenResponse({ description: 'Solo recicladores' })
  @ApiOperation({ summary: 'Reseñas que recibí de los negocios: estrellas, etiquetas, comentario, negocio y fecha' })
  @ApiOkResponse({
    schema: { example: { resumen: EJEMPLO_RESUMEN, datos: [{ ...EJEMPLO_RESENA, autor: 'Acopio Titicaca' }] } },
  })
  mias(@UsuarioActual() usuario: UsuarioSesion) {
    return this.resenas.delReciclador(usuario.id);
  }

  @Get('mi-negocio/resenas')
  @ApiBearerAuth()
  @Roles('CENTRO', 'COMPRADOR_MOVIL')
  @ApiForbiddenResponse({ description: 'Solo negocios' })
  @ApiOperation({ summary: 'Reseñas recibidas por mi negocio (pantalla 48)' })
  @ConsultaZod('filtro', esquemaFiltro)
  recibidas(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query('filtro', new ValidarCon(esquemaFiltro)) filtro: z.infer<typeof esquemaFiltro>,
  ) {
    return this.resenas.recibidas(usuario, filtro);
  }

  @Post('resenas/:id/respuesta')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles('CENTRO', 'COMPRADOR_MOVIL')
  @ApiForbiddenResponse({ description: 'Solo el negocio reseñado' })
  @ApiOperation({ summary: 'Responde una reseña una sola vez, en público' })
  @CuerpoZod(esquemaRespuestaResena, { texto: 'Gracias, estamos mejorando la fila en horas pico.' })
  @ApiConflictResponse({ description: 'YA_RESPONDIDA' })
  responder(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaRespuestaResena)) cuerpo: z.infer<typeof esquemaRespuestaResena>,
  ) {
    return this.resenas.responder(usuario, id, cuerpo.texto);
  }

  @Post('resenas/:id/reportes')
  @HttpCode(200)
  @ApiBearerAuth()
  @Roles('RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL')
  @ApiOperation({ summary: 'Reporta una reseña; queda guardada para la moderación (Fase 8)' })
  @CuerpoZod(esquemaReporteResena, { detalle: 'Contiene insultos.' })
  @ApiConflictResponse({ description: 'YA_REPORTADA' })
  reportar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaReporteResena)) cuerpo: z.infer<typeof esquemaReporteResena>,
  ) {
    return this.resenas.reportar(usuario, id, cuerpo.detalle ?? null);
  }
}
