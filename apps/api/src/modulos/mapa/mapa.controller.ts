import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  esquemaCalculadora,
  esquemaComparar,
  esquemaDetalleNegocio,
  esquemaFiltrosMapa,
  esquemaRuta,
  esquemaSolicitudLlegada,
  type FiltrosMapa,
  type RadioKm,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { Publica } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { MapaService } from './mapa.service.js';
import { CABECERA_POSICION, CABECERA_ZONA, Ubicacion, type UbicacionSolicitud } from './posicion.js';

const EJEMPLO_OPCION = {
  id: '9a1b…',
  nombre: 'Acopio Titicaca',
  tipo: 'CENTRO',
  vehiculo: null,
  esPro: true,
  destacado: true,
  distanciaKm: 1.4,
  zona: 'Centro de Juliaca',
  posicion: { lat: -15.4935, lng: -70.1355 },
  calificacion: { promedio: 4.7, cantidad: 23, nuevo: false },
  estado: { abierto: true, texto: 'Abierto hasta 18:00', tono: 'open' },
  pagos: ['EFECTIVO', 'YAPE'],
  precio: { min: '2.50', max: '2.80', actualizadoEn: '2026-11-15T14:00:00.000Z', antiguo: false },
  semaforo: { clave: 'MEJOR', texto: 'Mejor precio', comparadoEntre: 6 },
  demanda: 'ALTA',
};

// Mapa y lista (09, 10) y ficha pública (15): los ve también el invitado
@ApiTags('Mapa')
@Publica()
@Controller('compradores')
export class MapaController {
  constructor(private readonly mapa: MapaService) {}

  @Get()
  @ApiOperation({
    summary: 'Quién compra el material cerca, con el semáforo ya calculado entre las opciones que pasan los filtros',
    description:
      'Orden "recomendado": primero los Pro como Destacado y luego por cercanía. Con cualquier otro orden el plan se ignora. El semáforo nunca depende del plan.',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ApiOkResponse({
    schema: {
      example: {
        material: { codigo: 'pet', nombre: 'PET' },
        radioKm: 5,
        referencia: 'posicion',
        comparadoEntre: 6,
        opciones: [EJEMPLO_OPCION],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Falta el material o la ubicación (UBICACION_REQUERIDA)' })
  async buscar(
    @Query(new ValidarCon(esquemaFiltrosMapa)) filtros: FiltrosMapa,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    return this.mapa.buscar(filtros, await this.mapa.puntoDeReferencia(ubicacion.posicion, ubicacion.zonaId));
  }

  @Get('comparar')
  @ApiOperation({
    summary: 'Compara de 2 a 3 negocios (pantalla 20). El semáforo se calcula solo entre los elegidos, por material',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ConsultaZod('ids', esquemaComparar.shape.ids, 'Ids separados por coma (2 o 3)')
  @ApiUnprocessableEntityResponse({ description: 'COMPARAR_INSUFICIENTE: menos de 2 negocios visibles' })
  async comparar(
    @Query(new ValidarCon(esquemaComparar)) consulta: z.infer<typeof esquemaComparar>,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    const referencia =
      ubicacion.posicion || ubicacion.zonaId
        ? await this.mapa.puntoDeReferencia(ubicacion.posicion, ubicacion.zonaId)
        : null;
    return this.mapa.comparar(consulta.ids, referencia);
  }

  @Post(':id/solicitudes-llegada')
  @HttpCode(201)
  @ApiOperation({
    summary:
      '"Cómo llegar" (pantalla 21, RN-17): devuelve el destino público y el enlace a Google Maps con solo el destino. El negocio no recibe aviso; solo suma al conteo',
  })
  @CuerpoZod(esquemaSolicitudLlegada, { material: 'pet' })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '9a1b…',
        nombre: 'Acopio Titicaca',
        tipo: 'CENTRO',
        direccion: 'Jr. Moquegua 450, Juliaca',
        posicion: { lat: -15.4935, lng: -70.1355 },
        enlace: 'https://www.google.com/maps/dir/?api=1&destination=-15.493500,-70.135500',
        rutaDisponible: true,
      },
    },
  })
  @ApiNotFoundResponse({ description: 'No existe o no está verificado' })
  solicitarLlegada(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaSolicitudLlegada)) cuerpo: z.infer<typeof esquemaSolicitudLlegada>,
  ) {
    return this.mapa.solicitarLlegada(id, cuerpo.material ?? null);
  }

  @Get(':id/ruta')
  @ApiOperation({
    summary:
      'Trazo, distancia, tiempo y pasos. El servidor lo pide a Google con el origen redondeado (~110 m); sin clave de servidor, ruta es null',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ConsultaZod('modo', esquemaRuta.shape.modo)
  @ApiBadRequestResponse({ description: 'UBICACION_REQUERIDA' })
  async ruta(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ValidarCon(esquemaRuta)) consulta: z.infer<typeof esquemaRuta>,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    return this.mapa.ruta(id, consulta.modo, await this.mapa.puntoDeReferencia(ubicacion.posicion, ubicacion.zonaId));
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Ficha pública del negocio: materiales con rango, semáforo, demanda y fecha; horario, contacto, pagos y fotos',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ApiNotFoundResponse({ description: 'No existe o no está verificado' })
  async detalle(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ValidarCon(esquemaDetalleNegocio)) consulta: z.infer<typeof esquemaDetalleNegocio>,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    const referencia =
      ubicacion.posicion || ubicacion.zonaId
        ? await this.mapa.puntoDeReferencia(ubicacion.posicion, ubicacion.zonaId)
        : null;
    return this.mapa.detalle(id, consulta.radio, referencia, consulta.material);
  }
}

// Pantalla 18: la usa también el invitado
@ApiTags('Mapa')
@Publica()
@Controller('calculadora')
export class CalculadoraController {
  constructor(private readonly mapa: MapaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Valor estimado de los kilos y las 3 mejores opciones cercanas, con el mismo conjunto y semáforo que el mapa',
  })
  @ApiHeader(CABECERA_POSICION)
  @ApiHeader(CABECERA_ZONA)
  @ConsultaZod('material', esquemaCalculadora.shape.material)
  @ConsultaZod('kg', esquemaCalculadora.shape.kg)
  @ConsultaZod('radio', esquemaCalculadora.shape.radio)
  @ApiOkResponse({
    schema: {
      example: {
        material: { codigo: 'pet', nombre: 'PET' },
        kg: 10,
        radioKm: 5,
        comparadoEntre: 6,
        estimado: { min: '25.00', max: '28.00', negocio: 'Acopio Titicaca', distanciaKm: 1.4, tipo: 'CENTRO' },
        puntos: 10,
        opciones: [{ ...EJEMPLO_OPCION, valor: { min: '25.00', max: '28.00' } }],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Datos no válidos o UBICACION_REQUERIDA' })
  async calcular(
    @Query(new ValidarCon(esquemaCalculadora)) consulta: z.infer<typeof esquemaCalculadora>,
    @Ubicacion() ubicacion: UbicacionSolicitud,
  ) {
    return this.mapa.calcular(
      consulta.material,
      consulta.kg,
      consulta.radio as RadioKm,
      await this.mapa.puntoDeReferencia(ubicacion.posicion, ubicacion.zonaId),
    );
  }
}
