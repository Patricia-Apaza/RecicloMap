import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { esquemaAviso, esquemaFiltroAvisos } from '@reciclomap/shared';
import { z } from 'zod';
import {
  NegocioVerificado,
  Publica,
  Roles,
  UsuarioActual,
  type UsuarioSesion,
} from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { AvisosService } from './avisos.service.js';

const esquemaCiudad = z.object({
  ciudad: z.coerce.number().int().positive().optional(),
  tipo: esquemaFiltroAvisos.shape.tipo,
  pagina: esquemaFiltroAvisos.shape.pagina,
});

@ApiTags('Avisos del negocio')
@ApiBearerAuth()
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@ApiForbiddenResponse({ description: 'Solo negocios; cada uno ve únicamente los suyos' })
@Controller('mi-negocio/avisos')
export class MisAvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get()
  @ApiOperation({ summary: 'Mis avisos y los límites (iguales para Gratis y Pro)' })
  mios(@UsuarioActual() usuario: UsuarioSesion) {
    return this.avisos.misAvisos(usuario);
  }

  @Post()
  @NegocioVerificado()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Publica un aviso informativo (solo negocios verificados). El servidor rechaza precios, teléfonos y enlaces. Avisa a quienes lo tienen en favoritos con la alerta de anuncios activada',
  })
  @CuerpoZod(esquemaAviso, {
    tipo: 'ANUNCIO',
    titulo: 'Horario especial el sábado',
    mensaje: 'Atendemos de 8 a 12.',
    vigenciaDias: 7,
  })
  @ApiConflictResponse({ description: 'LIMITE_AVISOS: ya tienes el máximo de avisos activos' })
  @ApiUnprocessableEntityResponse({ description: 'VIGENCIA_EXCESIVA' })
  publicar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaAviso)) cuerpo: z.infer<typeof esquemaAviso>,
  ) {
    return this.avisos.publicar(usuario, cuerpo);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Quita un aviso antes de que venza' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No existe o no es tuyo' })
  async quitar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    await this.avisos.quitar(usuario, id);
  }
}

// Los ven el invitado, el reciclador y la administración
@ApiTags('Avisos del negocio')
@Publica()
@Controller()
export class AvisosPublicosController {
  constructor(private readonly avisos: AvisosService) {}

  @Get('compradores/:id/avisos')
  @ApiOperation({ summary: 'Avisos vigentes de un negocio verificado (ficha 15)' })
  @ApiNotFoundResponse({ description: 'No existe o no está verificado' })
  delNegocio(@Param('id', ParseUUIDPipe) id: string) {
    return this.avisos.delNegocio(id);
  }

  @Get('avisos')
  @ApiOperation({ summary: 'Avisos vigentes de la ciudad (sección Avisos)' })
  @ConsultaZod('ciudad', esquemaCiudad.shape.ciudad)
  @ConsultaZod('tipo', esquemaCiudad.shape.tipo)
  @ConsultaZod('pagina', esquemaCiudad.shape.pagina)
  deLaCiudad(@Query(new ValidarCon(esquemaCiudad)) consulta: z.infer<typeof esquemaCiudad>) {
    return this.avisos.deLaCiudad(consulta.ciudad, consulta.tipo, consulta.pagina);
  }
}
