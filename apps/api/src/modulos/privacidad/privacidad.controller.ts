import { Body, Controller, Delete, Get, HttpCode, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  esquemaAceptarTextos,
  esquemaEliminarCuenta,
  esquemaExportarDatos,
  esquemaPedirCodigoEliminacion,
} from '@reciclomap/shared';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { z } from 'zod';
import { limiteConfirmacionPorMinuto } from '../../nucleo/configuracion/configuracion.js';
import {
  PermiteEstados,
  SinTextosVigentes,
  UsuarioActual,
  type UsuarioSesion,
} from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { ConsentimientosService } from './consentimientos.service.js';
import { EliminacionService } from './eliminacion.service.js';
import { ExportacionService } from './exportacion.service.js';
import { Reautenticacion } from './reautenticacion.js';

// Confirmar con contraseña o código es un blanco de fuerza bruta: pocos intentos por minuto
const LIMITE_CONFIRMACION = { default: { limit: () => limiteConfirmacionPorMinuto(), ttl: 60_000 } };

@ApiTags('Privacidad')
@ApiBearerAuth()
@Controller('yo')
export class PrivacidadController {
  constructor(
    private readonly exportacion: ExportacionService,
    private readonly eliminacion: EliminacionService,
    private readonly consentimientos: ConsentimientosService,
    private readonly reautenticacion: Reautenticacion,
  ) {}

  @Get('privacidad')
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO', 'EN_ELIMINACION')
  @SinTextosVigentes()
  @ApiOperation({
    summary:
      'Pantalla 39: textos legales aceptados, si hoy puede descargar sus datos y el estado de la eliminación con lo que la bloquea',
  })
  @ApiOkResponse({
    schema: {
      example: {
        textos: { versionVigente: '2026-12', pendientes: [], aceptados: [] },
        exportacion: { disponible: true, ultimaEn: null },
        eliminacion: { enEliminacion: false, programadaEn: null, graciaDias: 7, puedeEliminar: true, bloqueos: [] },
      },
    },
  })
  async resumen(@UsuarioActual() usuario: UsuarioSesion) {
    const [textos, exportacion, eliminacion, tieneContrasena] = await Promise.all([
      this.consentimientos.estado(usuario.id),
      this.exportacion.estado(usuario.id),
      this.eliminacion.estado(usuario.id),
      this.reautenticacion.tieneContrasena(usuario.id),
    ]);
    return { textos, exportacion, eliminacion, tieneContrasena };
  }

  @Post('consentimientos')
  @HttpCode(200)
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO', 'EN_ELIMINACION')
  @SinTextosVigentes()
  @ApiOperation({ summary: 'Acepta la versión vigente de los Términos y la Política de privacidad' })
  @CuerpoZod(esquemaAceptarTextos, { version: '2026-12', aceptaTerminos: true })
  @ApiUnprocessableEntityResponse({ description: 'La versión enviada ya no es la vigente' })
  aceptar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaAceptarTextos)) _datos: z.infer<typeof esquemaAceptarTextos>,
  ) {
    return this.consentimientos.aceptar(usuario.id);
  }

  @Post('exportacion')
  @Throttle(LIMITE_CONFIRMACION)
  @HttpCode(200)
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({
    summary:
      'Descarga una copia en JSON de los datos propios. Pide la contraseña y se permite una por día; solo queda el hecho en el registro, sin contenido',
  })
  @CuerpoZod(esquemaExportarDatos, { contrasena: 'clave-segura-1' })
  @ApiOkResponse({ description: 'Archivo JSON (Content-Disposition: attachment)' })
  @ApiUnprocessableEntityResponse({ description: 'CONTRASENA_INCORRECTA o SIN_CONTRASENA' })
  @ApiTooManyRequestsResponse({ description: 'EXPORTACION_DIARIA' })
  async exportar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaExportarDatos)) datos: z.infer<typeof esquemaExportarDatos>,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const { nombreArchivo, documento } = await this.exportacion.exportar(usuario.id, datos.contrasena, datos.codigo);
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    respuesta.setHeader('Cache-Control', 'no-store');
    return documento;
  }

  @Post('exportacion/codigo')
  @Throttle(LIMITE_CONFIRMACION)
  @HttpCode(200)
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({
    summary: 'Para cuentas que entran solo con Google: envía un código al teléfono para confirmar la descarga de datos',
  })
  @ApiConflictResponse({ description: 'CONTRASENA_DISPONIBLE: la cuenta tiene contraseña' })
  pedirCodigoExportacion(@UsuarioActual() usuario: UsuarioSesion) {
    return this.exportacion.pedirCodigo(usuario.id);
  }

  @Post('eliminacion/codigo')
  @Throttle(LIMITE_CONFIRMACION)
  @HttpCode(200)
  @ApiOperation({ summary: 'Paso 1 de eliminar la cuenta: con la contraseña, envía un código al teléfono' })
  @CuerpoZod(esquemaPedirCodigoEliminacion, { contrasena: 'clave-segura-1' })
  @ApiForbiddenResponse({ description: 'ADMIN_NO_ELIMINABLE' })
  @ApiConflictResponse({ description: 'ELIMINACION_BLOQUEADA (con el detalle de qué resolver) o CUENTA_NO_ACTIVA' })
  pedirCodigo(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaPedirCodigoEliminacion)) datos: z.infer<typeof esquemaPedirCodigoEliminacion>,
  ) {
    return this.eliminacion.pedirCodigo(usuario.id, datos.contrasena);
  }

  @Post('eliminacion')
  @Throttle(LIMITE_CONFIRMACION)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Paso 2: con contraseña y código, la cuenta queda inactiva 7 días (se puede cancelar iniciando sesión) y luego se anonimiza sin posibilidad de recuperarla',
  })
  @CuerpoZod(esquemaEliminarCuenta, { contrasena: 'clave-segura-1', codigo: '123456', entiendo: true })
  @ApiConflictResponse({ description: 'ELIMINACION_BLOQUEADA' })
  solicitar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaEliminarCuenta)) datos: z.infer<typeof esquemaEliminarCuenta>,
  ) {
    return this.eliminacion.solicitar(usuario.id, datos.contrasena, datos.codigo);
  }

  @Delete('eliminacion')
  @PermiteEstados('EN_ELIMINACION')
  @SinTextosVigentes()
  @ApiOperation({ summary: 'Cancela la eliminación durante el período de gracia' })
  @ApiConflictResponse({ description: 'SIN_ELIMINACION' })
  cancelar(@UsuarioActual() usuario: UsuarioSesion) {
    return this.eliminacion.cancelar(usuario.id);
  }
}
