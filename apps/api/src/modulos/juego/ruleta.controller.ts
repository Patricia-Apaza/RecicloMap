import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaFiltroPremios, esquemaGirar, esquemaRenunciarPremio } from '@reciclomap/shared';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { RuletaService } from './ruleta.service.js';

@ApiTags('Ruleta y premios')
@ApiBearerAuth()
@Roles('RECICLADOR')
@ApiForbiddenResponse({ description: 'Solo recicladores; cada uno ve únicamente lo suyo' })
@Controller('yo')
export class RuletaController {
  constructor(private readonly ruleta: RuletaService) {}

  @Get('ruleta')
  @ApiOperation({
    summary:
      'Giros disponibles, avance hacia el siguiente, Meta del mes y premios posibles con su probabilidad real (pantalla 34). La probabilidad de un premio agotado o fuera de campaña pasa a "Sigue intentando"',
  })
  @ApiOkResponse({
    schema: {
      example: {
        giros: { disponibles: 1, puntosPorGiro: 500, avance: 120, faltan: 380 },
        puedeGirar: true,
        premios: [{ nombre: '+20 puntos', tipo: 'PUNTOS', probabilidad: 15, disponible: true }],
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'RULETA_NO_DISPONIBLE: la configuración no suma 100 %' })
  estado(@UsuarioActual() usuario: UsuarioSesion) {
    return this.ruleta.estado(usuario.id);
  }

  @Post('ruleta/girar')
  @HttpCode(200)
  @CuerpoZod(esquemaGirar, { clave: '6b1f6a4e-6a0e-4f6e-9d52-0d6d6d2f3c11' })
  @ApiOperation({
    summary:
      'Gira la ruleta. Gasta exactamente un giro y el servidor decide el resultado antes de la animación. Repetir la misma clave devuelve el mismo resultado sin gastar otro giro',
  })
  @ApiConflictResponse({ description: 'SIN_GIROS' })
  @ApiForbiddenResponse({ description: 'RULETA_REQUIERE_TELEFONO: cuenta sin teléfono verificado' })
  girar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaGirar)) cuerpo: z.infer<typeof esquemaGirar>,
  ) {
    return this.ruleta.girar(usuario.id, cuerpo.clave);
  }

  @Get('premios')
  @ConsultaZod('filtro', esquemaFiltroPremios.shape.filtro)
  @ApiOperation({
    summary:
      'Mis premios (pantalla 35): premios con objeto (por reclamar, reclamado, entregado, venció) y puntos acreditados. El código aparece al reclamar',
  })
  premios(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroPremios)) consulta: z.infer<typeof esquemaFiltroPremios>,
  ) {
    return this.ruleta.misPremios(usuario.id, consulta.filtro);
  }

  @Post('premios/:id/reclamar')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Pide el reclamo de un premio con objeto dentro de su plazo y muestra el código y el punto de entrega. La entrega la marca administración',
  })
  @ApiConflictResponse({ description: 'PREMIO_YA_RECLAMADO o PREMIO_VENCIDO' })
  @ApiNotFoundResponse({ description: 'No es un premio de esta cuenta' })
  reclamar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.ruleta.reclamar(usuario.id, id);
  }

  @Post('premios/:id/renunciar')
  @HttpCode(200)
  @CuerpoZod(esquemaRenunciarPremio, { confirmar: true })
  @ApiOperation({
    summary:
      'Renuncia a un premio por reclamar o reclamado. No devuelve stock y queda en el registro. Sirve para poder eliminar la cuenta sin esperar',
  })
  @ApiConflictResponse({ description: 'PREMIO_NO_RENUNCIABLE' })
  renunciar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaRenunciarPremio)) _cuerpo: z.infer<typeof esquemaRenunciarPremio>,
  ) {
    return this.ruleta.renunciar(usuario.id, id);
  }
}
