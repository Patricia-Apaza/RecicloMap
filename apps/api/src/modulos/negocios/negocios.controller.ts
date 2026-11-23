import { Body, Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  esquemaBorradorNegocio,
  esquemaCambioDireccion,
  esquemaDatosNegocio,
  esquemaHorariosNegocio,
  esquemaPagosNegocio,
  esquemaRegistroNegocioCompleto,
  type RegistroNegocioCompleto,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { PermiteEstados, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { DatosNegocioService } from './datos-negocio.service.js';
import { NegociosService } from './negocios.service.js';

const EJEMPLO_CENTRO = {
  tipo: 'CENTRO',
  nombreComercial: 'EcoAcopio Juliaca',
  descripcion: 'Compramos material limpio y separado.',
  direccion: 'Av. Independencia 1120, Juliaca',
  zonaId: 1,
  whatsapp: '952118340',
  horario: { dias: [1, 2, 3, 4, 5, 6], abre: '08:00', cierra: '18:00' },
  precios: { pet: { min: 2.0, max: 2.4, demanda: 'ALTA' }, carton: { min: 0.6, max: 0.7, demanda: 'MEDIA' } },
  pagos: ['EFECTIVO', 'YAPE'],
};

const EJEMPLO_ESTADO = {
  borrador: null,
  negocio: { tipo: 'CENTRO', nombreComercial: 'EcoAcopio Juliaca', estadoVerificacion: 'EN_REVISION' },
  verificacion: { estado: 'EN_REVISION', motivo: null, mensaje: null, creadaEn: '2026-11-14T15:00:00.000Z' },
};

@ApiTags('Mi negocio')
@ApiBearerAuth()
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@Controller('mi-negocio')
export class NegociosController {
  constructor(
    private readonly negocios: NegociosService,
    private readonly datos: DatosNegocioService,
  ) {}

  @Get('datos')
  @ApiOperation({ summary: 'Datos, horario, pagos y la última solicitud de cambio de dirección (pantalla 47)' })
  leerDatos(@UsuarioActual() usuario: UsuarioSesion) {
    return this.datos.leer(usuario);
  }

  @Patch('datos')
  @ApiOperation({ summary: 'Nombre, descripción, WhatsApp, teléfono del local o vehículo. Se aplican al momento' })
  @CuerpoZod(esquemaDatosNegocio, {
    nombreComercial: 'Acopio Titicaca',
    descripcion: 'Báscula calibrada.',
    whatsapp: '951234567',
  })
  guardarDatos(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaDatosNegocio)) cuerpo: z.infer<typeof esquemaDatosNegocio>,
  ) {
    return this.datos.guardarDatos(usuario, cuerpo);
  }

  @Put('horarios')
  @ApiOperation({ summary: 'Horario por día (centro) o habitual (comprador móvil)' })
  @CuerpoZod(esquemaHorariosNegocio, { dias: [{ dia: 1, abre: '08:00', cierra: '18:00' }], habitual: null })
  guardarHorarios(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaHorariosNegocio)) cuerpo: z.infer<typeof esquemaHorariosNegocio>,
  ) {
    return this.datos.guardarHorarios(usuario, cuerpo);
  }

  @Put('pagos')
  @ApiOperation({ summary: 'Medios de pago que acepta' })
  @CuerpoZod(esquemaPagosNegocio, { pagos: ['EFECTIVO', 'YAPE'] })
  guardarPagos(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaPagosNegocio)) cuerpo: z.infer<typeof esquemaPagosNegocio>,
  ) {
    return this.datos.guardarPagos(usuario, cuerpo.pagos);
  }

  @Post('cambio-direccion')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Solicita cambiar la dirección o el pin del centro. Lo aprueba el administrador; mientras tanto se muestra la dirección anterior (S5)',
  })
  @CuerpoZod(esquemaCambioDireccion, {
    direccion: 'Jr. Moquegua 480, Juliaca',
    zonaId: 1,
    ubicacion: { lat: -15.4936, lng: -70.1352 },
  })
  @ApiConflictResponse({ description: 'CAMBIO_EN_REVISION o NEGOCIO_NO_VERIFICADO' })
  @ApiUnprocessableEntityResponse({ description: 'SOLO_CENTROS, ZONA_NO_VALIDA o PIN_FUERA_DE_LA_CIUDAD' })
  cambioDireccion(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaCambioDireccion)) cuerpo: z.infer<typeof esquemaCambioDireccion>,
  ) {
    return this.datos.pedirCambioDireccion(usuario, cuerpo);
  }

  @Get()
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Datos del negocio propio, su borrador y su estado de verificación (pantalla 07)' })
  @ApiOkResponse({ schema: { example: EJEMPLO_ESTADO } })
  estado(@UsuarioActual() usuario: UsuarioSesion) {
    return this.negocios.estado(usuario.id);
  }

  @Put('registro')
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Guarda el borrador del registro por pasos (pantallas 05 y 06)' })
  @CuerpoZod(esquemaBorradorNegocio, { paso: 2, datos: { nombreComercial: 'EcoAcopio Juliaca' } })
  @ApiConflictResponse({ description: 'El negocio ya se envió y no está pendiente de corrección' })
  guardarBorrador(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaBorradorNegocio)) cuerpo: z.infer<typeof esquemaBorradorNegocio>,
  ) {
    return this.negocios.guardarBorrador(usuario, cuerpo.paso, cuerpo.datos);
  }

  @Post('registro/enviar')
  @HttpCode(200)
  @PermiteEstados('REGISTRO_INCOMPLETO')
  @ApiOperation({
    summary: 'Envía el registro completo para verificación',
    description:
      'Todo material marcado necesita su rango de precio por kg (S/ 0.10 a S/ 50.00). El error dice qué material falta.',
  })
  @CuerpoZod(esquemaRegistroNegocioCompleto, EJEMPLO_CENTRO)
  @ApiOkResponse({ schema: { example: EJEMPLO_ESTADO } })
  @ApiUnprocessableEntityResponse({ description: 'El tipo no coincide con la cuenta o la zona no es de su ciudad' })
  enviar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaRegistroNegocioCompleto)) datos: RegistroNegocioCompleto,
  ) {
    return this.negocios.enviar(usuario, datos);
  }

  @Get('verificacion')
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Estado de la verificación: En revisión, Info pedida, Rechazado con motivo o Verificado' })
  async verificacion(@UsuarioActual() usuario: UsuarioSesion) {
    return (await this.negocios.estado(usuario.id)).verificacion;
  }

  @Post('verificacion/reenviar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Corrige los datos y vuelve a enviar a revisión, si el administrador lo pidió o lo rechazó',
  })
  @CuerpoZod(esquemaRegistroNegocioCompleto, EJEMPLO_CENTRO)
  @ApiOkResponse({ schema: { example: EJEMPLO_ESTADO } })
  @ApiConflictResponse({ description: 'No hay una corrección pendiente' })
  reenviar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaRegistroNegocioCompleto)) datos: RegistroNegocioCompleto,
  ) {
    return this.negocios.reenviar(usuario, datos);
  }
}
