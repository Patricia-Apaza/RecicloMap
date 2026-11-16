import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaResolverIncidencia } from '@reciclomap/shared';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { IncidenciasService } from './incidencias.service.js';

const esquemaEstado = z.enum(['abiertas', 'resueltas']).default('abiertas');

@ApiTags('Administración · Incidencias')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo la administración' })
@Roles('ADMIN')
@Controller('admin/incidencias')
export class IncidenciasController {
  constructor(private readonly incidencias: IncidenciasService) {}

  @Get()
  @ApiOperation({ summary: '"No conforme" y entregas sin confirmar, con las decisiones posibles en cada una' })
  @ConsultaZod('estado', esquemaEstado)
  @ApiOkResponse({
    schema: {
      example: {
        datos: [
          {
            id: 'r1…',
            estado: 'PENDIENTE',
            motivo: 'NO_CONFORME',
            detalle: 'Entregué 18 kg y confirmaron 12 kg.',
            operacion: {
              estado: 'CONFIRMADA',
              kgPublicados: 18,
              kgConfirmados: 12,
              reciclador: 'Marco Q.',
              negocio: 'EcoAcopio Juliaca',
            },
            decisiones: ['PEDIR_CORRECCION', 'CERRAR_CON_KILOS_VIGENTES', 'ANULAR'],
          },
        ],
      },
    },
  })
  listar(@Query('estado', new ValidarCon(esquemaEstado)) estado: z.infer<typeof esquemaEstado>) {
    return this.incidencias.listar(estado === 'abiertas');
  }

  @Post(':id/resolver')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Resuelve una incidencia: pedir al negocio que corrija los kilos, cerrar con los kilos vigentes o anular sin puntos',
    description: 'El administrador nunca escribe el peso. Cada decisión queda en la auditoría.',
  })
  @CuerpoZod(esquemaResolverIncidencia, {
    decision: 'PEDIR_CORRECCION',
    motivo: 'Las fotos de la báscula no coinciden.',
  })
  @ApiConflictResponse({ description: 'INCIDENCIA_CERRADA o DECISION_NO_VALIDA' })
  resolver(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaResolverIncidencia)) cuerpo: z.infer<typeof esquemaResolverIncidencia>,
  ) {
    return this.incidencias.resolver(usuario.id, id, cuerpo.decision, cuerpo.motivo);
  }
}
