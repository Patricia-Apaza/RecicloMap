import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  esquemaConfirmarEntrega,
  esquemaEntregaDirecta,
  esquemaFiltroEntregas,
  esquemaRechazarEntrega,
} from '@reciclomap/shared';
import { z } from 'zod';
import { NegocioVerificado, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { EntregasService } from './entregas.service.js';

@ApiTags('Entrega directa')
@ApiBearerAuth()
@Roles('RECICLADOR')
@ApiForbiddenResponse({ description: 'Solo recicladores' })
@Controller('registros-directos')
export class RegistrosDirectosController {
  constructor(private readonly entregas: EntregasService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Registra material entregado a un negocio sin publicación previa (RN-15). Queda por confirmar: no da puntos hasta que el negocio lo confirme. Máximo 3 pendientes y vence a los 7 días',
  })
  @CuerpoZod(esquemaEntregaDirecta, {
    compradorId: '7d3c2b1a-0000-4000-8000-000000000001',
    material: 'carton',
    kg: 12,
  })
  @ApiCreatedResponse({ description: 'Registro creado, por confirmar' })
  @ApiConflictResponse({ description: 'LIMITE_PENDIENTES o ENTREGA_DUPLICADA' })
  @ApiUnprocessableEntityResponse({ description: 'FECHA_NO_VALIDA' })
  @ApiNotFoundResponse({ description: 'Negocio no verificado o inexistente' })
  registrar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaEntregaDirecta)) cuerpo: z.infer<typeof esquemaEntregaDirecta>,
  ) {
    return this.entregas.registrar(usuario, cuerpo);
  }

  @Get('negocios')
  @ApiOperation({ summary: 'Negocios verificados de mi ciudad para elegir a quién entregué (solo datos públicos)' })
  negocios(@UsuarioActual() usuario: UsuarioSesion) {
    return this.entregas.negocios(usuario);
  }

  @Get('mios')
  @ApiOperation({ summary: 'Mis entregas directas con su estado y el tope diario de puntos' })
  @ApiOkResponse({
    schema: { example: { limites: { topeDiario: 150, puntosHoy: 0, maxPendientes: 3, pendientes: 1 }, datos: [] } },
  })
  mias(@UsuarioActual() usuario: UsuarioSesion) {
    return this.entregas.mias(usuario);
  }
}

@ApiTags('Entrega directa')
@ApiBearerAuth()
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@ApiForbiddenResponse({ description: 'Solo negocios; cada uno ve únicamente lo suyo' })
@Controller('mi-negocio/entregas-directas')
export class EntregasDelNegocioController {
  constructor(private readonly entregas: EntregasService) {}

  @Get()
  @ConsultaZod('estado', esquemaFiltroEntregas.shape.estado)
  @ApiOperation({ summary: 'Entregas directas que los recicladores registraron a mi negocio' })
  lista(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroEntregas)) consulta: z.infer<typeof esquemaFiltroEntregas>,
  ) {
    return this.entregas.delNegocio(usuario, consulta.estado);
  }

  @Post(':id/confirmar')
  @NegocioVerificado()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Confirma la entrega con los kilos que recibió (prellenados y ajustables); el valor confirmado es el que cuenta. Los puntos respetan el tope diario del reciclador',
  })
  @CuerpoZod(esquemaConfirmarEntrega, { kg: 11.5 })
  @ApiConflictResponse({ description: 'ENTREGA_YA_RESUELTA o ENTREGA_VENCIDA' })
  @ApiNotFoundResponse({ description: 'No existe o no es de tu negocio' })
  confirmar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaConfirmarEntrega)) cuerpo: z.infer<typeof esquemaConfirmarEntrega>,
  ) {
    return this.entregas.confirmar(usuario, id, cuerpo.kg);
  }

  @Post(':id/rechazar')
  @NegocioVerificado()
  @HttpCode(200)
  @ApiOperation({ summary: 'Rechaza la entrega con un motivo; no da puntos' })
  @CuerpoZod(esquemaRechazarEntrega, { motivo: 'No recibí ese material.' })
  @ApiConflictResponse({ description: 'ENTREGA_YA_RESUELTA' })
  @ApiNotFoundResponse({ description: 'No existe o no es de tu negocio' })
  rechazar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaRechazarEntrega)) cuerpo: z.infer<typeof esquemaRechazarEntrega>,
  ) {
    return this.entregas.rechazar(usuario, id, cuerpo.motivo);
  }
}
