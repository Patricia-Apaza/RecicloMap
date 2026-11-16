import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
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
import { type DatosOferta, esquemaFiltroCercanas, esquemaFiltroOfertas, esquemaOferta } from '@reciclomap/shared';
import type { z } from 'zod';
import { NegocioVerificado, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { NegocioPublicacionesService } from './negocio-publicaciones.service.js';

const EJEMPLO_RECICLADOR = {
  alias: 'Reciclador',
  ciudad: 'Juliaca',
  nivel: { numero: 4, nombre: 'Guardián' },
  calificacion: { promedio: '4.8', cantidad: 14, nuevo: false },
  operaciones: 14,
  confiable: true,
  telefonoVerificado: true,
};
const EJEMPLO_CERCANA = {
  id: '5c2e…',
  estado: 'DISPONIBLE',
  material: { codigo: 'pet', nombre: 'PET' },
  kg: 42,
  precioEsperado: '2.50',
  nota: null,
  fotos: [],
  venceEn: '2026-11-23T14:00:00.000Z',
  diasRestantes: 6,
  tramo: '1–2 km',
  compraEsteMaterial: true,
  miOferta: null,
  reciclador: EJEMPLO_RECICLADOR,
};
const EJEMPLO_MI_OFERTA = { id: 'a1…', estado: 'PENDIENTE', precioKg: '2.70', total: '113.40', operacionId: null };

@ApiTags('Publicaciones cercanas (negocio)')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo centros y compradores móviles verificados (RN-18)' })
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@NegocioVerificado()
@Controller('negocio')
export class NegocioPublicacionesController {
  constructor(private readonly servicio: NegocioPublicacionesService) {}

  @Get('publicaciones')
  @ApiOperation({
    summary: 'Publicaciones abiertas de la ciudad, de la más cercana a la más lejana (pantallas 42 y 52)',
    description:
      'Las ve todo negocio verificado, compre o no ese material (RF-23). Del reciclador solo ciudad, tramo, nivel, calificación y operaciones: nunca nombre, barrio, coordenadas ni distancia numérica. No muestra ofertas de otros negocios.',
  })
  @ConsultaZod('material', esquemaFiltroCercanas.shape.material)
  @ConsultaZod('pagina', esquemaFiltroCercanas.shape.pagina)
  @ConsultaZod('porPagina', esquemaFiltroCercanas.shape.porPagina, 'Entre 1 y 50; 20 por defecto')
  @ApiOkResponse({ schema: { example: { total: 1, pagina: 1, porPagina: 20, datos: [EJEMPLO_CERCANA] } } })
  cercanas(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroCercanas)) filtro: z.infer<typeof esquemaFiltroCercanas>,
  ) {
    return this.servicio.cercanas(usuario, filtro.material, filtro.pagina, filtro.porPagina);
  }

  @Get('publicaciones/:id')
  @ApiOperation({
    summary: 'Detalle de una publicación cercana, con mi precio para ese material y las reseñas del reciclador (44)',
  })
  @ApiOkResponse({ schema: { example: { ...EJEMPLO_CERCANA, miPrecio: { min: '2.50', max: '2.80' }, resenas: [] } } })
  @ApiNotFoundResponse({ description: 'Ya no está disponible o es de otra ciudad' })
  detalle(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.detalle(usuario, id);
  }

  @Post('publicaciones/:id/ofertas')
  @ApiOperation({
    summary: 'Hace una oferta por kg; el total se calcula y se guarda. Avisa al reciclador',
    description:
      'Una oferta vigente por negocio y publicación. Se puede volver a ofertar tras retirar, no tras un rechazo (S2).',
  })
  @CuerpoZod(esquemaOferta, {
    precioKg: 2.7,
    mensaje: 'Puedo recoger hoy por la tarde.',
    cuandoRecoge: 'Hoy por la tarde',
  })
  @ApiCreatedResponse({ schema: { example: EJEMPLO_MI_OFERTA } })
  @ApiConflictResponse({ description: 'OFERTA_EXISTENTE, OFERTA_RECHAZADA o PUBLICACION_NO_DISPONIBLE' })
  ofertar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaOferta)) datos: DatosOferta,
  ) {
    return this.servicio.ofertar(usuario, id, datos);
  }

  @Get('ofertas')
  @ApiOperation({ summary: 'Ofertas que envié, con sus estados (pantalla 45)' })
  @ConsultaZod('estado', esquemaFiltroOfertas.shape.estado)
  @ApiOkResponse({
    schema: {
      example: {
        indicadores: { enviadas: 3, pendientes: 1, aceptadas: 1, tasaAceptacion: 50 },
        conteos: { todas: 3, pendientes: 1, aceptadas: 1, 'no-seleccionadas': 1, retiradas: 0 },
        datos: [],
      },
    },
  })
  enviadas(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroOfertas)) filtro: z.infer<typeof esquemaFiltroOfertas>,
  ) {
    return this.servicio.enviadas(usuario, filtro.estado);
  }

  @Put('ofertas/:id')
  @ApiOperation({ summary: 'Cambia precio, mensaje o cuándo recoge de una oferta pendiente. Avisa al reciclador' })
  @CuerpoZod(esquemaOferta, { precioKg: 2.8, mensaje: 'Subo mi oferta.', cuandoRecoge: 'Mañana por la mañana' })
  @ApiOkResponse({ schema: { example: EJEMPLO_MI_OFERTA } })
  @ApiConflictResponse({ description: 'OFERTA_NO_PENDIENTE o PUBLICACION_NO_DISPONIBLE' })
  cambiar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaOferta)) datos: DatosOferta,
  ) {
    return this.servicio.cambiarOferta(usuario, id, datos);
  }

  @Post('ofertas/:id/retirar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Retira una oferta pendiente; después se puede volver a ofertar en esa publicación' })
  @ApiOkResponse({ schema: { example: { ...EJEMPLO_MI_OFERTA, estado: 'RETIRADA' } } })
  @ApiConflictResponse({ description: 'OFERTA_NO_PENDIENTE' })
  retirar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.retirar(usuario, id);
  }
}
