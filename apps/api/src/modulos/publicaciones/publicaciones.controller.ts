import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type EdicionPublicacion,
  esquemaCancelarPublicacion,
  esquemaEditarPublicacion,
  esquemaGrupoPublicacion,
  esquemaNuevaPublicacion,
  type NuevaPublicacion,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { CABECERA_POSICION, CABECERA_ZONA, Ubicacion, type UbicacionSolicitud } from '../mapa/posicion.js';
import { PublicacionesService } from './publicaciones.service.js';

const EJEMPLO_PUBLICACION = {
  id: '5c2e…',
  estado: 'CON_OFERTAS',
  material: { codigo: 'pet', nombre: 'PET' },
  kg: 35,
  precioEsperado: '2.60',
  nota: 'Botellas limpias y aplastadas',
  fotos: [],
  creadaEn: '2026-11-16T14:00:00.000Z',
  venceEn: '2026-11-23T14:00:00.000Z',
  diasRestantes: 7,
  motivoCancelacion: null,
  ofertas: { total: 3, pendientes: 3, mejorPrecioKg: '2.85' },
  operacion: null,
};

@ApiTags('Publicaciones (reciclador)')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo recicladores' })
@Roles('RECICLADOR')
@Controller('publicaciones')
export class PublicacionesController {
  constructor(private readonly publicaciones: PublicacionesService) {}

  @Post()
  @ApiOperation({
    summary: 'Publica material (pantalla 12). Vence a los 7 días y la ven todos los negocios verificados de la ciudad',
    description:
      'La ciudad sale de la cuenta. La ubicación llega en X-Posicion o X-Zona (si no, la zona del perfil): se guarda para calcular tramos y nunca se devuelve. Avisa a los negocios a 5 km o menos.',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @CuerpoZod(esquemaNuevaPublicacion, { material: 'pet', kg: 35, precioEsperado: 2.6, nota: 'En costales', fotos: [] })
  @ApiCreatedResponse({ schema: { example: { publicacion: EJEMPLO_PUBLICACION, loVeran: 10 } } })
  @ApiBadRequestResponse({ description: 'Datos no válidos o falta la ubicación (UBICACION_REQUERIDA)' })
  crear(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaNuevaPublicacion)) datos: NuevaPublicacion,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    return this.publicaciones.crear(usuario, datos, ubicacion);
  }

  @Get('alcance')
  @ApiOperation({
    summary: '"Lo verán N compradores": negocios verificados de la ciudad, compren o no ese material (RF-23)',
  })
  @ApiOkResponse({ schema: { example: { negocios: 10 } } })
  alcance(@UsuarioActual() usuario: UsuarioSesion) {
    return this.publicaciones.alcance(usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Mis publicaciones por pestaña: activas, finalizadas, vencidas o canceladas (pantalla 13)' })
  @ConsultaZod('grupo', esquemaGrupoPublicacion.shape.grupo)
  @ApiOkResponse({
    schema: {
      example: {
        indicadores: { activas: 2, ofertasSinResponder: 3, kgActivos: 95, porVencer: 0 },
        conteos: { activas: 2, finalizadas: 0, vencidas: 1, canceladas: 1 },
        datos: [EJEMPLO_PUBLICACION],
      },
    },
  })
  listar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaGrupoPublicacion)) consulta: z.infer<typeof esquemaGrupoPublicacion>,
  ) {
    return this.publicaciones.listar(usuario, consulta.grupo);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de mi publicación: vigencia, resumen de ofertas y línea de tiempo (pantalla 23)' })
  @ApiNotFoundResponse({ description: 'No existe o no es mía' })
  detalle(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicaciones.detalle(usuario, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edita kilos, precio esperado, nota y fotos. Solo sin ofertas pendientes (P15)' })
  @CuerpoZod(esquemaEditarPublicacion, { kg: 40, precioEsperado: 2.5, nota: null, fotos: [] })
  @ApiConflictResponse({ description: 'PUBLICACION_NO_EDITABLE: tiene ofertas pendientes o ya no está activa' })
  editar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaEditarPublicacion)) datos: EdicionPublicacion,
  ) {
    return this.publicaciones.editar(usuario, id, datos);
  }

  @Post(':id/renovar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renueva la vigencia a 7 días desde hoy (disponible o con ofertas)' })
  @ApiConflictResponse({ description: 'PUBLICACION_NO_RENOVABLE' })
  renovar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicaciones.renovar(usuario, id);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancela con motivo. Las ofertas pendientes pasan a NO_SELECCIONADA y cada negocio recibe el aviso',
  })
  @CuerpoZod(esquemaCancelarPublicacion, { motivo: 'Ya vendí el material' })
  @ApiConflictResponse({ description: 'PUBLICACION_NO_CANCELABLE: ya hay una oferta aceptada o no está activa' })
  cancelar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaCancelarPublicacion)) cuerpo: z.infer<typeof esquemaCancelarPublicacion>,
  ) {
    return this.publicaciones.cancelar(usuario, id, cuerpo.motivo);
  }

  @Post(':id/volver-a-publicar')
  @ApiOperation({
    summary: 'Desde una vencida crea una publicación nueva con los mismos datos; la ubicación se toma de nuevo',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ApiCreatedResponse({ schema: { example: EJEMPLO_PUBLICACION } })
  @ApiConflictResponse({ description: 'PUBLICACION_NO_COPIABLE' })
  volverAPublicar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    return this.publicaciones.copiar(usuario, id, 'volver', ubicacion);
  }

  @Post(':id/duplicar')
  @ApiOperation({
    summary:
      'Desde una finalizada o cancelada crea una publicación nueva con los mismos datos; la ubicación se toma de nuevo',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ApiCreatedResponse({ schema: { example: EJEMPLO_PUBLICACION } })
  @ApiConflictResponse({ description: 'PUBLICACION_NO_COPIABLE' })
  duplicar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    return this.publicaciones.copiar(usuario, id, 'duplicar', ubicacion);
  }

  @Get(':id/ofertas')
  @ApiOperation({
    summary:
      'Ofertas recibidas para comparar por total (pantalla 24). Marca la de mayor total si hay 2 o más pendientes',
  })
  @ApiOkResponse({
    schema: {
      example: {
        publicacion: EJEMPLO_PUBLICACION,
        mayorTotalId: 'a1…',
        ofertas: [
          {
            id: 'a1…',
            estado: 'PENDIENTE',
            precioKg: '2.85',
            total: '99.75',
            mensaje: 'Pago en efectivo o Yape.',
            cuandoRecoge: 'Mañana por la mañana',
            negocio: {
              tipo: 'CENTRO',
              nombre: 'Acopio Titicaca',
              esPro: true,
              whatsapp: '900000011',
              distanciaKm: 1.4,
            },
          },
        ],
      },
    },
  })
  ofertas(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicaciones.ofertasRecibidas(usuario, id);
  }
}

@ApiTags('Publicaciones (reciclador)')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo el reciclador dueño de la publicación' })
@Roles('RECICLADOR')
@Controller('ofertas')
export class OfertasRecibidasController {
  constructor(private readonly publicaciones: PublicacionesService) {}

  @Post(':id/aceptar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Acepta una oferta en una sola transacción',
    description:
      'Las demás pendientes pasan a NO_SELECCIONADA (RN-08), se crea la operación en ACEPTADA, se libera el WhatsApp entre las partes y se anota si fue la de mayor total entre 2 o más. Dos aceptaciones simultáneas: una gana y la otra recibe 409.',
  })
  @ApiOkResponse({ schema: { example: { operacionId: '7d…', aceptoMayorTotal: true, noSeleccionadas: 2 } } })
  @ApiConflictResponse({ description: 'PUBLICACION_NO_DISPONIBLE u OFERTA_NO_PENDIENTE' })
  aceptar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicaciones.aceptar(usuario, id);
  }

  @Post(':id/rechazar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rechaza una oferta. Si no queda ninguna pendiente, la publicación vuelve a DISPONIBLE' })
  @ApiOkResponse({ schema: { example: { estadoPublicacion: 'DISPONIBLE', pendientes: 0 } } })
  @ApiConflictResponse({ description: 'OFERTA_NO_PENDIENTE' })
  rechazar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicaciones.rechazar(usuario, id);
  }
}
