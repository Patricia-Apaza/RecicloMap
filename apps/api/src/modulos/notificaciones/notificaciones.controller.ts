import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  esquemaFiltroNotificaciones,
  esquemaPreferenciasNotificacion,
  esquemaSuscripcionPush,
} from '@reciclomap/shared';
import { z } from 'zod';
import { PermiteEstados, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { NotificacionesService } from './notificaciones.service.js';

const esquemaFiltro = esquemaFiltroNotificaciones.shape.filtro;
const esquemaBaja = z.object({ endpoint: z.url() });

@ApiTags('Notificaciones')
@ApiBearerAuth()
@PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  @ApiOperation({
    summary: 'Bandeja de notificaciones propias, las 50 más recientes (pantalla 32)',
    description: 'Filtros: todas, sin-leer, ofertas, operaciones, premios o avisos.',
  })
  @ConsultaZod('filtro', esquemaFiltro)
  async listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query('filtro', new ValidarCon(esquemaFiltro)) filtro: z.infer<typeof esquemaFiltro>,
  ) {
    return { datos: await this.notificaciones.listar(usuario.id, filtro) };
  }

  @Get('contador')
  @ApiOperation({ summary: 'Cantidad sin leer, para la campana' })
  @ApiOkResponse({ schema: { example: { sinLeer: 3 } } })
  async contador(@UsuarioActual() usuario: UsuarioSesion) {
    return { sinLeer: await this.notificaciones.contarSinLeer(usuario.id) };
  }

  @Post('leer-todas')
  @HttpCode(204)
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Marca todas como leídas' })
  @ApiNoContentResponse()
  async leerTodas(@UsuarioActual() usuario: UsuarioSesion): Promise<void> {
    await this.notificaciones.marcarTodasLeidas(usuario.id);
  }

  @Post(':id/leer')
  @HttpCode(204)
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Marca una como leída' })
  @ApiNoContentResponse()
  async leer(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notificaciones.marcarLeida(usuario.id, id);
  }

  @Get('preferencias')
  @ApiOperation({ summary: 'Qué grupos de avisos recibo. Los de una operación propia y los de la cuenta no se apagan' })
  @ApiOkResponse({
    schema: { example: { ofertas: true, operaciones: true, premios: true, avisos: true, precios: false } },
  })
  preferencias(@UsuarioActual() usuario: UsuarioSesion) {
    return this.notificaciones.preferencias(usuario.id);
  }

  @Put('preferencias')
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Activa o desactiva un grupo de avisos (ofertas, premios, avisos o precios)' })
  @CuerpoZod(esquemaPreferenciasNotificacion, { premios: false })
  cambiarPreferencias(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaPreferenciasNotificacion)) cambio: z.infer<typeof esquemaPreferenciasNotificacion>,
  ) {
    return this.notificaciones.cambiarPreferencias(usuario.id, cambio);
  }

  @Post('push')
  @HttpCode(204)
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Registra este navegador para recibir avisos con la app cerrada (Web Push)' })
  @CuerpoZod(esquemaSuscripcionPush, {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'BN…', auth: 'k3…' },
  })
  @ApiNoContentResponse()
  async suscribir(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaSuscripcionPush)) datos: z.infer<typeof esquemaSuscripcionPush>,
  ): Promise<void> {
    await this.notificaciones.suscribirPush(usuario.id, datos);
  }

  @Delete('push')
  @HttpCode(204)
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Deja de enviar avisos push a este navegador' })
  @CuerpoZod(esquemaBaja, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' })
  @ApiNoContentResponse()
  async desuscribir(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaBaja)) datos: z.infer<typeof esquemaBaja>,
  ): Promise<void> {
    await this.notificaciones.desuscribirPush(usuario.id, datos.endpoint);
  }
}
