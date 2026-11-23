import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  esquemaActivarPlan,
  esquemaBuscarNegocioPlan,
  esquemaColaPlan,
  esquemaMotivoPlan,
  esquemaSolicitudPlan,
} from '@reciclomap/shared';
import { z } from 'zod';
import { NegocioVerificado, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { PlanAdminService } from './plan-admin.service.js';
import { PlanService } from './plan.service.js';

@ApiTags('Plan Pro del negocio')
@ApiBearerAuth()
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@ApiForbiddenResponse({ description: 'Solo negocios' })
@Controller('mi-negocio/plan')
export class MiPlanController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  @ApiOperation({
    summary:
      'Mi plan (Gratis, solicitado o Pro hasta una fecha), si puedo pedir Pro, mi solicitud y mi historial. Sin precios ni cobros: el plan lo activa la administración',
  })
  estado(@UsuarioActual() usuario: UsuarioSesion) {
    return this.plan.estado(usuario);
  }

  @Post('solicitud')
  @NegocioVerificado()
  @HttpCode(201)
  @CuerpoZod(esquemaSolicitudPlan, { mensaje: 'Quiero ver las estadísticas de 90 días.' })
  @ApiOperation({
    summary: 'Pide el plan Pro (una solicitud a la vez, con mensaje opcional). Avisa a la administración',
  })
  @ApiConflictResponse({ description: 'SOLICITUD_PENDIENTE o PLAN_VIGENTE' })
  solicitar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaSolicitudPlan)) cuerpo: z.infer<typeof esquemaSolicitudPlan>,
  ) {
    return this.plan.solicitar(usuario, cuerpo);
  }

  @Delete('solicitud')
  @NegocioVerificado()
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancela mi solicitud mientras siga en revisión' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No hay una solicitud en revisión' })
  async cancelar(@UsuarioActual() usuario: UsuarioSesion) {
    await this.plan.cancelar(usuario);
  }
}

@ApiTags('Administración · Plan Pro')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/plan')
export class PlanAdminController {
  constructor(private readonly plan: PlanAdminService) {}

  @Get('solicitudes')
  @ConsultaZod('estado', esquemaColaPlan.shape.estado)
  @ApiOperation({ summary: 'Cola de solicitudes del plan Pro, de la más antigua a la más reciente' })
  cola(@Query(new ValidarCon(esquemaColaPlan)) consulta: z.infer<typeof esquemaColaPlan>) {
    return this.plan.cola(consulta.estado);
  }

  @Get('negocios')
  @ConsultaZod('q', esquemaBuscarNegocioPlan.shape.q)
  @ApiOperation({
    summary: 'Negocios verificados con su plan, para activar o desactivar Pro por cuenta de la administración',
  })
  negocios(@Query(new ValidarCon(esquemaBuscarNegocioPlan)) consulta: z.infer<typeof esquemaBuscarNegocioPlan>) {
    return this.plan.negocios(consulta.q);
  }

  @Get('negocios/:id/historial')
  @ApiOperation({ summary: 'Historial del plan de un negocio' })
  @ApiNotFoundResponse()
  historial(@Param('id', ParseUUIDPipe) id: string) {
    return this.plan.historial(id);
  }

  @Post('solicitudes/:id/aprobar')
  @HttpCode(200)
  @CuerpoZod(esquemaActivarPlan, {
    desde: '2026-12-01',
    hasta: '2027-02-28',
    motivo: 'Negocio verificado con buen historial',
  })
  @ApiOperation({
    summary: 'Aprueba la solicitud y activa Pro con fecha de inicio y de fin. Motivo obligatorio y auditoría',
  })
  @ApiConflictResponse({ description: 'SOLICITUD_YA_RESUELTA, NEGOCIO_NO_VERIFICADO o CUENTA_SUSPENDIDA' })
  @ApiUnprocessableEntityResponse({ description: 'FECHA_NO_VALIDA' })
  aprobar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaActivarPlan)) cuerpo: z.infer<typeof esquemaActivarPlan>,
  ) {
    return this.plan.aprobar(admin.id, id, cuerpo);
  }

  @Post('solicitudes/:id/rechazar')
  @HttpCode(200)
  @CuerpoZod(esquemaMotivoPlan, { motivo: 'Aún no cumple los requisitos' })
  @ApiOperation({ summary: 'Rechaza la solicitud con motivo obligatorio. Se avisa al negocio' })
  @ApiConflictResponse({ description: 'SOLICITUD_YA_RESUELTA' })
  rechazar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoPlan)) cuerpo: z.infer<typeof esquemaMotivoPlan>,
  ) {
    return this.plan.rechazar(admin.id, id, cuerpo.motivo);
  }

  @Post('negocios/:id/activar')
  @HttpCode(200)
  @CuerpoZod(esquemaActivarPlan, { desde: '2026-12-01', hasta: '2027-02-28', motivo: 'Activado a pedido del negocio' })
  @ApiOperation({ summary: 'Activa Pro por cuenta de la administración, con fechas y motivo. Queda en auditoría' })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'NEGOCIO_NO_VERIFICADO o CUENTA_SUSPENDIDA' })
  activar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaActivarPlan)) cuerpo: z.infer<typeof esquemaActivarPlan>,
  ) {
    return this.plan.activar(admin.id, id, cuerpo);
  }

  @Post('negocios/:id/desactivar')
  @HttpCode(200)
  @CuerpoZod(esquemaMotivoPlan, { motivo: 'Pedido del negocio' })
  @ApiOperation({ summary: 'Desactiva Pro con motivo obligatorio. El negocio vuelve a Gratis sin perder datos' })
  @ApiConflictResponse({ description: 'PLAN_NO_ACTIVO' })
  desactivar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoPlan)) cuerpo: z.infer<typeof esquemaMotivoPlan>,
  ) {
    return this.plan.desactivar(admin.id, id, cuerpo.motivo);
  }
}
