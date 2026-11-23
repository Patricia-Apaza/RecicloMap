import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  esquemaListaAuditoria,
  esquemaPaginaPrivacidad,
  esquemaListaAvisosAdmin,
  esquemaListaUsuarios,
  esquemaModerarAviso,
  esquemaPeriodoPanel,
  esquemaReactivar,
  esquemaSuspender,
} from '@reciclomap/shared';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { AuditoriaAdminService } from './auditoria-admin.service.js';
import { AvisosAdminService } from './avisos-admin.service.js';
import { PanelAdminService } from './panel-admin.service.js';
import { UsuariosAdminService } from './usuarios-admin.service.js';

@ApiTags('Administración · Usuarios')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/usuarios')
export class UsuariosAdminController {
  constructor(private readonly usuarios: UsuariosAdminService) {}

  @Get()
  @ConsultaZod('rol', esquemaListaUsuarios.shape.rol)
  @ConsultaZod('situacion', esquemaListaUsuarios.shape.situacion)
  @ConsultaZod('ciudad', esquemaListaUsuarios.shape.ciudad)
  @ConsultaZod('q', esquemaListaUsuarios.shape.q)
  @ApiOperation({
    summary: 'Cuentas con filtros por rol, ciudad, situación y búsqueda por nombre, correo o teléfono (pantalla 59)',
  })
  listar(@Query(new ValidarCon(esquemaListaUsuarios)) consulta: z.infer<typeof esquemaListaUsuarios>) {
    return this.usuarios.listar(consulta);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Ficha de una cuenta: nombre, correo, teléfono, ciudad, situación y actividad resumida. Nunca ubicación ni contraseña',
  })
  @ApiNotFoundResponse()
  ficha(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuarios.ficha(id);
  }

  @Post(':id/suspender')
  @HttpCode(200)
  @CuerpoZod(esquemaSuspender, {
    motivo: 'Información falsa',
    nota: 'Dos negocios confirmaron que el dato era falso.',
    confirmar: true,
  })
  @ApiOperation({
    summary:
      'Suspende una cuenta activa con motivo y confirmación. No publica ni oferta ni aparece en el mapa; lee su historial. Sus ofertas pendientes se retiran y sus publicaciones abiertas se ocultan, con aviso a la otra parte. Las operaciones en curso no se cortan',
  })
  @ApiConflictResponse({ description: 'CUENTA_ADMIN o CUENTA_NO_ACTIVA' })
  suspender(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaSuspender)) cuerpo: z.infer<typeof esquemaSuspender>,
  ) {
    return this.usuarios.suspender(admin.id, id, cuerpo);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  @CuerpoZod(esquemaReactivar, { motivo: 'Aclaró lo ocurrido', confirmar: true })
  @ApiOperation({
    summary: 'Reactiva una cuenta suspendida con motivo y confirmación; sus publicaciones abiertas vuelven a verse',
  })
  @ApiConflictResponse({ description: 'CUENTA_NO_SUSPENDIDA' })
  reactivar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaReactivar)) cuerpo: z.infer<typeof esquemaReactivar>,
  ) {
    return this.usuarios.reactivar(admin.id, id, cuerpo);
  }
}

@ApiTags('Administración · Avisos')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/avisos')
export class AvisosAdminController {
  constructor(private readonly avisos: AvisosAdminService) {}

  @Get()
  @ConsultaZod('estado', esquemaListaAvisosAdmin.shape.estado)
  @ConsultaZod('q', esquemaListaAvisosAdmin.shape.q)
  @ApiOperation({ summary: 'Avisos de los negocios para moderar: activos, ocultos o todos' })
  listar(@Query(new ValidarCon(esquemaListaAvisosAdmin)) consulta: z.infer<typeof esquemaListaAvisosAdmin>) {
    return this.avisos.listar(consulta);
  }

  @Post(':id/ocultar')
  @HttpCode(200)
  @CuerpoZod(esquemaModerarAviso, { motivo: 'Incluye un precio, lo que no se permite en avisos', confirmar: true })
  @ApiOperation({ summary: 'Oculta un aviso con motivo y confirmación (no lo edita). El negocio recibe el motivo' })
  @ApiConflictResponse({ description: 'AVISO_YA_OCULTO' })
  ocultar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaModerarAviso)) cuerpo: z.infer<typeof esquemaModerarAviso>,
  ) {
    return this.avisos.ocultar(admin.id, id, cuerpo);
  }

  @Post(':id/restituir')
  @HttpCode(200)
  @CuerpoZod(esquemaModerarAviso, { motivo: 'El negocio corrigió el contenido', confirmar: true })
  @ApiOperation({ summary: 'Restituye un aviso oculto con motivo y confirmación' })
  @ApiConflictResponse({ description: 'AVISO_NO_OCULTO, AVISO_VENCIDO o LIMITE_AVISOS' })
  restituir(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaModerarAviso)) cuerpo: z.infer<typeof esquemaModerarAviso>,
  ) {
    return this.avisos.restituir(admin.id, id, cuerpo);
  }
}

@ApiTags('Administración · Auditoría')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/auditoria')
export class AuditoriaAdminController {
  constructor(private readonly auditoria: AuditoriaAdminService) {}

  @Get()
  @ConsultaZod('tipo', esquemaListaAuditoria.shape.tipo)
  @ConsultaZod('admin', esquemaListaAuditoria.shape.admin)
  @ConsultaZod('accion', esquemaListaAuditoria.shape.accion)
  @ConsultaZod('entidad', esquemaListaAuditoria.shape.entidad)
  @ConsultaZod('q', esquemaListaAuditoria.shape.q)
  @ConsultaZod('desde', esquemaListaAuditoria.shape.desde)
  @ConsultaZod('hasta', esquemaListaAuditoria.shape.hasta)
  @ApiOperation({
    summary:
      'Registro de auditoría (pantalla 64), solo lectura, con filtros por quién, acción, sobre qué y fechas. No devuelve ubicación, contraseñas ni contactos',
  })
  listar(@Query(new ValidarCon(esquemaListaAuditoria)) consulta: z.infer<typeof esquemaListaAuditoria>) {
    return this.auditoria.listar(consulta);
  }

  @Get('privacidad')
  @ConsultaZod('pagina', esquemaListaAuditoria.shape.pagina)
  @ApiOperation({
    summary:
      'Hechos de privacidad: descargas de datos, eliminaciones solicitadas, canceladas y concluidas, y aceptaciones de textos. Solo el hecho, sin contenido',
  })
  privacidad(@Query(new ValidarCon(esquemaPaginaPrivacidad)) consulta: z.infer<typeof esquemaPaginaPrivacidad>) {
    return this.auditoria.privacidad(consulta.pagina);
  }
}

@ApiTags('Administración · Panel')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/panel')
export class PanelAdminController {
  constructor(private readonly panel: PanelAdminService) {}

  @Get()
  @ConsultaZod('periodo', esquemaPeriodoPanel.shape.periodo)
  @ApiOperation({
    summary:
      'Panel de inicio (pantalla 57): pendientes por atender y métricas reales de la plataforma en un período de 7, 30 o 90 días. Solo conteos',
  })
  resumen(@Query(new ValidarCon(esquemaPeriodoPanel)) consulta: z.infer<typeof esquemaPeriodoPanel>) {
    return this.panel.resumen(consulta.periodo);
  }
}
