import { Body, Controller, Headers, HttpCode, Post, Put, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  esquemaCambiarContrasena,
  esquemaCodigoAdmin,
  esquemaCompletarGoogle,
  esquemaEnviarCodigo,
  esquemaGoogle,
  esquemaInicioSesion,
  esquemaRecuperar,
  esquemaRegistroNegocio,
  esquemaRegistroReciclador,
  esquemaRestablecer,
  esquemaVerificarRecuperacion,
  esquemaVerificarTelefono,
} from '@reciclomap/shared';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import {
  Configuracion,
  limiteAccesoPorMinuto,
  limiteRefrescoPorMinuto,
} from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import {
  PermiteEstados,
  Publica,
  SinTextosVigentes,
  UsuarioActual,
  type UsuarioSesion,
} from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import {
  AuthService,
  type PasoPendiente,
  type ResultadoAcceso,
  type Sesion,
  type SesionAbierta,
} from './auth.service.js';

const COOKIE_REFRESCO = 'rm_refresco';
const RUTA_COOKIE = '/api/v1/auth';

// Más estricto que el resto de la API: frena intentos repetidos de contraseñas y códigos
const LIMITE_ACCESO = { default: { limit: () => limiteAccesoPorMinuto(), ttl: 60_000 } };

const EJEMPLO_SESION = {
  tokenAcceso: 'eyJhbGciOiJIUzI1NiJ9…',
  expiraEn: '2026-11-14T15:15:00.000Z',
  usuario: { id: '7f6c…', nombre: 'Marco Quispe', rol: 'RECICLADOR', estado: 'ACTIVO', siguientePaso: 'LISTO' },
};
const EJEMPLO_PASO = { siguientePaso: 'VERIFICAR_TELEFONO', telefono: '••• ••• 567', reenviarEn: 60 };

const esquemaRefresco = z.object({ tokenRefresco: z.string().min(1).optional() }).optional();

@ApiTags('Acceso')
@Throttle(LIMITE_ACCESO)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly configuracion: Configuracion,
  ) {}

  @Publica()
  @Post('registro/reciclador')
  @ApiOperation({ summary: 'Crea la cuenta de un reciclador y envía el código al teléfono' })
  @CuerpoZod(esquemaRegistroReciclador, {
    nombre: 'Marco Quispe',
    telefono: '951234567',
    correo: 'marco@correo.pe',
    contrasena: 'clave-segura-1',
    aceptaTerminos: true,
    mayorDeEdad: true,
  })
  @ApiCreatedResponse({ schema: { example: EJEMPLO_PASO } })
  @ApiConflictResponse({ description: 'El teléfono o el correo ya tienen cuenta' })
  registrarReciclador(
    @Body(new ValidarCon(esquemaRegistroReciclador)) datos: z.infer<typeof esquemaRegistroReciclador>,
  ) {
    return this.auth.registrarReciclador(datos);
  }

  @Publica()
  @Post('registro/negocio')
  @ApiOperation({ summary: 'Paso "Tu cuenta" de un centro o comprador móvil; envía el código al teléfono' })
  @CuerpoZod(esquemaRegistroNegocio, {
    tipo: 'CENTRO',
    telefono: '952118340',
    contrasena: 'clave-segura-1',
    aceptaTerminos: true,
    mayorDeEdad: true,
  })
  @ApiCreatedResponse({ schema: { example: EJEMPLO_PASO } })
  @ApiConflictResponse({ description: 'El teléfono o el correo ya tienen cuenta' })
  registrarNegocio(@Body(new ValidarCon(esquemaRegistroNegocio)) datos: z.infer<typeof esquemaRegistroNegocio>) {
    return this.auth.registrarNegocio(datos);
  }

  @Publica()
  @Post('telefono/enviar-codigo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reenvía el código de verificación; la respuesta no revela si el teléfono existe' })
  @CuerpoZod(esquemaEnviarCodigo, { telefono: '951234567' })
  @ApiOkResponse({ schema: { example: EJEMPLO_PASO } })
  @ApiTooManyRequestsResponse({ description: 'Hay que esperar 60 segundos entre códigos' })
  reenviarCodigo(@Body(new ValidarCon(esquemaEnviarCodigo)) datos: z.infer<typeof esquemaEnviarCodigo>) {
    return this.auth.reenviarCodigoTelefono(datos.telefono);
  }

  @Publica()
  @Post('telefono/verificar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verifica el teléfono con el código de 6 dígitos y abre la sesión' })
  @CuerpoZod(esquemaVerificarTelefono, { telefono: '951234567', codigo: '123456' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SESION } })
  async verificarTelefono(
    @Body(new ValidarCon(esquemaVerificarTelefono)) datos: z.infer<typeof esquemaVerificarTelefono>,
    @Headers() cabeceras: Record<string, string | undefined>,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    return this.entregar(
      await this.auth.verificarTelefono(datos.telefono, datos.codigo, cabeceras['user-agent']),
      cabeceras,
      respuesta,
    );
  }

  @Publica()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inicia sesión con teléfono o correo y contraseña',
    description:
      'Si el teléfono no está verificado o la cuenta es de administración, responde con `siguientePaso` y envía un código.',
  })
  @CuerpoZod(esquemaInicioSesion, { identificador: '951234567', contrasena: 'clave-segura-1' })
  @ApiOkResponse({ schema: { example: EJEMPLO_SESION } })
  @ApiUnauthorizedResponse({ description: 'Credenciales no válidas; el mensaje no dice cuál dato falló' })
  async iniciarSesion(
    @Body(new ValidarCon(esquemaInicioSesion)) datos: z.infer<typeof esquemaInicioSesion>,
    @Headers() cabeceras: Record<string, string | undefined>,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    return this.resolver(
      await this.auth.iniciarSesion(datos.identificador, datos.contrasena, cabeceras['user-agent']),
      cabeceras,
      respuesta,
    );
  }

  @Publica()
  @Post('admin/verificar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Segundo paso del ingreso de administración: código enviado al teléfono' })
  @CuerpoZod(esquemaCodigoAdmin)
  @ApiOkResponse({ schema: { example: EJEMPLO_SESION } })
  async verificarAdmin(
    @Body(new ValidarCon(esquemaCodigoAdmin)) datos: z.infer<typeof esquemaCodigoAdmin>,
    @Headers() cabeceras: Record<string, string | undefined>,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    return this.entregar(
      await this.auth.verificarCodigoAdmin(datos.tokenTemporal, datos.codigo, cabeceras['user-agent']),
      cabeceras,
      respuesta,
    );
  }

  @Publica()
  @Post('google')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inicia sesión con la credencial que entrega el botón de Google',
    description: 'Si la cuenta es nueva responde `COMPLETAR_CUENTA_GOOGLE` con un token temporal de 30 minutos.',
  })
  @CuerpoZod(esquemaGoogle)
  async iniciarConGoogle(
    @Body(new ValidarCon(esquemaGoogle)) datos: z.infer<typeof esquemaGoogle>,
    @Headers() cabeceras: Record<string, string | undefined>,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    return this.resolver(
      await this.auth.iniciarConGoogle(datos.credencial, cabeceras['user-agent']),
      cabeceras,
      respuesta,
    );
  }

  @Publica()
  @Post('google/completar')
  @ApiOperation({ summary: 'Completa la cuenta de Google con rol y teléfono; envía el código' })
  @CuerpoZod(esquemaCompletarGoogle)
  @ApiCreatedResponse({ schema: { example: EJEMPLO_PASO } })
  completarGoogle(@Body(new ValidarCon(esquemaCompletarGoogle)) datos: z.infer<typeof esquemaCompletarGoogle>) {
    return this.auth.completarCuentaGoogle(datos);
  }

  @Publica()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: () => limiteRefrescoPorMinuto(), ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renueva la sesión con el token de refresco',
    description: 'La web lo envía en una cookie que el navegador no deja leer; la app móvil, en el cuerpo.',
  })
  @ApiOkResponse({ schema: { example: EJEMPLO_SESION } })
  @ApiUnauthorizedResponse({ description: 'La sesión terminó o el token ya se usó' })
  async renovar(
    @Req() solicitud: Request,
    @Body(new ValidarCon(esquemaRefresco)) cuerpo: z.infer<typeof esquemaRefresco>,
    @Headers() cabeceras: Record<string, string | undefined>,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const token = leerCookie(solicitud) ?? cuerpo?.tokenRefresco;
    if (!token) throw new ErrorNegocio('SESION_INVALIDA', 'Tu sesión terminó. Vuelve a entrar.', 401);
    return this.entregar(await this.auth.renovar(token, cabeceras['user-agent']), cabeceras, respuesta);
  }

  @Publica()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cierra la sesión de este dispositivo' })
  @ApiNoContentResponse()
  async cerrarSesion(
    @Req() solicitud: Request,
    @Body(new ValidarCon(esquemaRefresco)) cuerpo: z.infer<typeof esquemaRefresco>,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    await this.auth.cerrarSesion(leerCookie(solicitud) ?? cuerpo?.tokenRefresco);
    respuesta.clearCookie(COOKIE_REFRESCO, this.opcionesCookie());
  }

  @Post('logout-todas')
  @HttpCode(204)
  @ApiBearerAuth()
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO', 'EN_ELIMINACION')
  @SinTextosVigentes()
  @ApiOperation({ summary: 'Cierra la sesión en todos los dispositivos' })
  @ApiNoContentResponse()
  async cerrarTodas(
    @UsuarioActual() usuario: UsuarioSesion,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    await this.auth.cerrarTodas(usuario.id);
    respuesta.clearCookie(COOKIE_REFRESCO, this.opcionesCookie());
  }

  @Publica()
  @Post('recuperar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Envía un código para recuperar la contraseña',
    description: 'Al teléfono, o al correo si se escribe un correo. Responde igual exista o no la cuenta.',
  })
  @CuerpoZod(esquemaRecuperar, { identificador: '951234567' })
  pedirRecuperacion(
    @Body(new ValidarCon(esquemaRecuperar)) datos: z.infer<typeof esquemaRecuperar>,
  ): Promise<PasoPendiente> {
    return this.auth.pedirRecuperacion(datos.identificador);
  }

  @Publica()
  @Post('recuperar/verificar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Valida el código de recuperación y entrega un token de 10 minutos para la nueva contraseña',
  })
  @CuerpoZod(esquemaVerificarRecuperacion)
  @ApiOkResponse({ schema: { example: { tokenRestablecer: 'eyJhbGciOiJIUzI1NiJ9…' } } })
  verificarRecuperacion(
    @Body(new ValidarCon(esquemaVerificarRecuperacion)) datos: z.infer<typeof esquemaVerificarRecuperacion>,
  ) {
    return this.auth.verificarRecuperacion(datos.identificador, datos.codigo);
  }

  @Publica()
  @Post('recuperar/restablecer')
  @HttpCode(204)
  @ApiOperation({ summary: 'Guarda la contraseña nueva y cierra todas las sesiones' })
  @CuerpoZod(esquemaRestablecer)
  @ApiNoContentResponse()
  async restablecer(
    @Body(new ValidarCon(esquemaRestablecer)) datos: z.infer<typeof esquemaRestablecer>,
  ): Promise<void> {
    await this.auth.restablecer(datos.tokenRestablecer, datos.contrasena);
  }

  @Put('contrasena')
  @HttpCode(204)
  @ApiBearerAuth()
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Cambia la contraseña y cierra todas las sesiones' })
  @CuerpoZod(esquemaCambiarContrasena)
  @ApiNoContentResponse()
  async cambiarContrasena(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaCambiarContrasena)) datos: z.infer<typeof esquemaCambiarContrasena>,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    await this.auth.cambiarContrasena(usuario.id, datos);
    respuesta.clearCookie(COOKIE_REFRESCO, this.opcionesCookie());
  }

  private resolver(resultado: ResultadoAcceso, cabeceras: Record<string, string | undefined>, respuesta: Response) {
    return resultado.tipo === 'sesion' ? this.entregar(resultado.abierta, cabeceras, respuesta) : resultado.paso;
  }

  // La web recibe el token de refresco en una cookie; la app móvil lo pide con la cabecera X-Cliente
  private entregar(
    { sesion, tokenRefresco, refrescoExpiraEn }: SesionAbierta,
    cabeceras: Record<string, string | undefined>,
    respuesta: Response,
  ): Sesion & { tokenRefresco?: string } {
    respuesta.cookie(COOKIE_REFRESCO, tokenRefresco, {
      ...this.opcionesCookie(),
      maxAge: Math.max(0, refrescoExpiraEn.getTime() - Date.now()),
    });
    return cabeceras['x-cliente'] === 'movil' ? { ...sesion, tokenRefresco } : sesion;
  }

  private opcionesCookie(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.configuracion.esProduccion, path: RUTA_COOKIE };
  }
}

function leerCookie(solicitud: Request): string | undefined {
  const cookies = solicitud.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[COOKIE_REFRESCO];
}
