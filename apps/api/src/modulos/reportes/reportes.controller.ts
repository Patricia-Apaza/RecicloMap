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
} from '@nestjs/swagger';
import {
  esquemaCorreccionAdmin,
  esquemaDescartarAlerta,
  esquemaFiltroAlertas,
  esquemaFiltroReportesAdmin,
  esquemaFiltroReportesNegocio,
  esquemaMotivoAdmin,
  esquemaReporteNegocio,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { AdminReportesService } from './admin-reportes.service.js';
import { ModeracionService } from './moderacion.service.js';
import { ReportesService } from './reportes.service.js';

type Motivo = z.infer<typeof esquemaMotivoAdmin>;
type Correccion = z.infer<typeof esquemaCorreccionAdmin>;
const EJEMPLO_MOTIVO = { motivo: 'Tres recicladores reportan el mismo precio de papel.' };
const EJEMPLO_CORRECCION = { ...EJEMPLO_MOTIVO, plazoHoras: 48 };

@ApiTags('Reportes')
@ApiBearerAuth()
@Roles('RECICLADOR')
@ApiForbiddenResponse({ description: 'Solo recicladores; el invitado necesita una cuenta' })
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Post()
  @ApiOperation({ summary: 'Reportar información de un negocio (pantalla 16). El negocio nunca sabe quién lo envió' })
  @CuerpoZod(esquemaReporteNegocio, {
    compradorId: '1f…',
    motivo: 'PRECIO',
    material: 'papel',
    precioVisto: 0.3,
    detalle: 'Fui hoy a las 3 pm y el papel lo pagaban a S/ 0.30.',
  })
  @ApiCreatedResponse({ schema: { example: { id: 'r1…', negocio: 'Acopio Cerro Colorado', estado: 'PENDIENTE' } } })
  @ApiNotFoundResponse({ description: 'El negocio no existe o no está verificado' })
  @ApiConflictResponse({ description: 'YA_REPORTADO: ya hay uno abierto por el mismo motivo' })
  crear(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaReporteNegocio)) cuerpo: z.infer<typeof esquemaReporteNegocio>,
  ) {
    return this.reportes.reportarNegocio(usuario, cuerpo);
  }

  @Get('mios')
  @ApiOperation({ summary: 'Mis reportes y su estado' })
  mios(@UsuarioActual() usuario: UsuarioSesion) {
    return this.reportes.misReportes(usuario);
  }
}

@ApiTags('Reportes')
@ApiBearerAuth()
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@ApiForbiddenResponse({ description: 'Solo negocios' })
@Controller('mi-negocio/reportes')
export class NegocioReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get()
  @ApiOperation({ summary: 'Reportes sobre mi negocio (pantalla 49): motivo y estado, nunca el autor' })
  @ConsultaZod('estado', esquemaFiltroReportesNegocio.shape.estado)
  @ApiOkResponse({
    schema: {
      example: {
        conteos: { todos: 2, correccion: 1, revision: 1, resueltos: 0 },
        datos: [
          {
            id: 'r1…',
            motivo: 'PRECIO',
            estado: 'CORRECCION_PEDIDA',
            correccion: {
              motivo: 'Actualiza el papel',
              plazoHasta: '2026-11-20T15:00:00.000Z',
              texto: 'Actualiza el precio en Precios y demanda.',
            },
          },
        ],
      },
    },
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroReportesNegocio)) filtro: z.infer<typeof esquemaFiltroReportesNegocio>,
  ) {
    return this.reportes.deMiNegocio(usuario, filtro.estado);
  }

  @Post(':id/corregido')
  @HttpCode(200)
  @ApiOperation({ summary: '"Ya lo corregí": vuelve a revisión del administrador' })
  @ApiConflictResponse({ description: 'SIN_CORRECCION_PEDIDA' })
  corregido(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.reportes.marcarCorregido(usuario, id);
  }
}

@ApiTags('Administración · Reportes y moderación')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo la administración' })
@ApiConflictResponse({ description: 'DECISION_NO_VALIDA o ACCION_NO_VALIDA: no aplica al estado actual' })
@Controller('admin')
export class AdminReportesController {
  constructor(
    private readonly reportes: AdminReportesService,
    private readonly moderacion: ModeracionService,
  ) {}

  @Get('reportes')
  @ApiOperation({
    summary:
      'Reportes de usuarios (pantalla 60): sobre negocios o sobre reseñas. Las incidencias de operación van en /admin/incidencias',
  })
  @ConsultaZod('tipo', esquemaFiltroReportesAdmin.shape.tipo)
  @ConsultaZod('estado', esquemaFiltroReportesAdmin.shape.estado)
  listar(@Query(new ValidarCon(esquemaFiltroReportesAdmin)) filtro: z.infer<typeof esquemaFiltroReportesAdmin>) {
    return this.reportes.listar(filtro.tipo, filtro.estado);
  }

  @Post('reportes/:id/pedir-correccion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pide al negocio corregir un dato, con plazo. No cambia ningún precio' })
  @CuerpoZod(esquemaCorreccionAdmin, EJEMPLO_CORRECCION)
  pedirCorreccion(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaCorreccionAdmin)) cuerpo: Correccion,
  ) {
    return this.reportes.pedirCorreccion(admin.id, id, cuerpo.motivo, cuerpo.plazoHoras);
  }

  @Post('reportes/:id/resolver')
  @HttpCode(200)
  @ApiOperation({ summary: 'Da el reporte por resuelto, con motivo' })
  @CuerpoZod(esquemaMotivoAdmin, EJEMPLO_MOTIVO)
  resolver(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoAdmin)) cuerpo: Motivo,
  ) {
    return this.reportes.resolver(admin.id, id, cuerpo.motivo);
  }

  @Post('reportes/:id/descartar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Descarta el reporte, con motivo' })
  @CuerpoZod(esquemaMotivoAdmin, EJEMPLO_MOTIVO)
  descartar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoAdmin)) cuerpo: Motivo,
  ) {
    return this.reportes.descartar(admin.id, id, cuerpo.motivo);
  }

  @Post('reportes/:id/ocultar-resena')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Oculta una reseña que rompe las reglas (insultos, datos personales, falsedad evidente). No la borra ni edita su texto',
  })
  @CuerpoZod(esquemaMotivoAdmin, { motivo: 'Incluye el teléfono personal de otra persona.' })
  @ApiConflictResponse({ description: 'YA_OCULTA' })
  ocultarResena(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoAdmin)) cuerpo: Motivo,
  ) {
    return this.reportes.ocultarResena(admin.id, id, cuerpo.motivo);
  }

  @Get('alertas')
  @ApiOperation({
    summary:
      'Alertas de posible colusión: pares reciclador–negocio repetidos y pesos atípicos. Solo avisan, no bloquean',
  })
  @ConsultaZod('dias', esquemaFiltroAlertas.shape.dias, 'Período a revisar, de 7 a 90 días; 30 por defecto')
  alertas(@Query(new ValidarCon(esquemaFiltroAlertas)) filtro: z.infer<typeof esquemaFiltroAlertas>) {
    return this.reportes.alertas(filtro.dias);
  }

  @Post('alertas/descartar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Descarta una alerta de colusión con motivo. No cambia ninguna operación; queda en la auditoría',
  })
  @CuerpoZod(esquemaDescartarAlerta, {
    tipo: 'PESO',
    clave: '7d3c2b1a-0000-4000-8000-000000000001',
    motivo: 'Se pesó dos veces frente a ambas partes.',
  })
  descartarAlerta(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaDescartarAlerta)) cuerpo: z.infer<typeof esquemaDescartarAlerta>,
  ) {
    return this.reportes.descartarAlerta(admin.id, cuerpo);
  }

  @Get('precios')
  @ApiOperation({ summary: 'Precios ordenados por riesgo, con alertas y moderación vigente (pantalla 61)' })
  precios() {
    return this.moderacion.listar();
  }

  @Post('precios/:id/marcar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca un precio como sospechoso. Nunca cambia su valor' })
  @CuerpoZod(esquemaMotivoAdmin, EJEMPLO_MOTIVO)
  marcar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoAdmin)) cuerpo: Motivo,
  ) {
    return this.moderacion.marcar(admin.id, id, cuerpo.motivo);
  }

  @Post('precios/:id/pedir-correccion')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pide corregir el precio con plazo. Al vencer avisa a la administración; no suspende solo' })
  @CuerpoZod(esquemaCorreccionAdmin, EJEMPLO_CORRECCION)
  pedirCorreccionPrecio(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaCorreccionAdmin)) cuerpo: Correccion,
  ) {
    return this.moderacion.pedirCorreccion(admin.id, id, cuerpo.motivo, cuerpo.plazoHoras);
  }

  @Post('precios/:id/suspender')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suspende la visibilidad: deja de aparecer en mapa, lista, detalle, calculadora, comparar y favoritos',
  })
  @CuerpoZod(esquemaMotivoAdmin, EJEMPLO_MOTIVO)
  suspender(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoAdmin)) cuerpo: Motivo,
  ) {
    return this.moderacion.suspender(admin.id, id, cuerpo.motivo);
  }

  @Post('precios/:id/restituir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cierra la moderación vigente y el precio vuelve a mostrarse' })
  @CuerpoZod(esquemaMotivoAdmin, EJEMPLO_MOTIVO)
  restituir(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoAdmin)) cuerpo: Motivo,
  ) {
    return this.moderacion.restituir(admin.id, id, cuerpo.motivo);
  }
}
