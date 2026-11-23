import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type EstadoMovil,
  esquemaEstadoMovil,
  esquemaPosicionDia,
  esquemaRutaDia,
  type RutaDia,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { NegocioVerificado, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { DiaMovilService } from './dia-movil.service.js';
import { MovilService } from './movil.service.js';

const EJEMPLO_INICIO = {
  nombre: 'Compras Rubén',
  ciudadId: 1,
  disponibilidad: 'DISPONIBLE',
  mostrarZona: true,
  zona: { id: 1, nombre: 'Barrio Santa Rosa' },
  zonaCambiableDesde: null,
  indicadores: {
    comprasHoy: 0,
    kgHoy: 0,
    kgMes: 0,
    ofertasEnviadas: 2,
    ofertasAceptadas: 1,
    calificacion: { promedio: '4.5', cantidad: 12, nuevo: false },
  },
};

@ApiTags('Comprador móvil')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo compradores móviles verificados' })
@Roles('COMPRADOR_MOVIL')
@NegocioVerificado()
@Controller()
export class MovilController {
  constructor(
    private readonly movil: MovilService,
    private readonly dia: DiaMovilService,
  ) {}

  @Get('comprador/inicio')
  @ApiOperation({ summary: 'Inicio del comprador móvil: estado, zona de trabajo e indicadores (pantalla 52)' })
  @ApiOkResponse({ schema: { example: EJEMPLO_INICIO } })
  inicio(@UsuarioActual() usuario: UsuarioSesion) {
    return this.movil.inicio(usuario);
  }

  @Put('mi-negocio/estado-movil')
  @ApiOperation({
    summary: 'Cambia disponibilidad, zona de trabajo o si se muestra la zona aproximada',
    description:
      'La zona de trabajo se cambia como máximo una vez cada 24 horas: es el punto desde el que se calculan los tramos.',
  })
  @CuerpoZod(esquemaEstadoMovil, { disponibilidad: 'EN_RUTA' })
  @ApiOkResponse({ schema: { example: { ...EJEMPLO_INICIO, disponibilidad: 'EN_RUTA' } } })
  @ApiConflictResponse({ description: 'ZONA_CAMBIADA_HOY' })
  cambiar(@UsuarioActual() usuario: UsuarioSesion, @Body(new ValidarCon(esquemaEstadoMovil)) datos: EstadoMovil) {
    return this.movil.cambiarEstado(usuario, datos);
  }

  @Get('mi-negocio/ruta')
  @ApiOperation({ summary: 'Ruta de hoy (pantalla 56). Caduca al terminar el día en Lima' })
  ruta(@UsuarioActual() usuario: UsuarioSesion) {
    return this.dia.ruta(usuario);
  }

  @Put('mi-negocio/ruta')
  @ApiOperation({
    summary:
      'Define las zonas de hoy con su horario aproximado y si se publica. Reemplaza la ruta anterior; no hay historial',
  })
  @CuerpoZod(esquemaRutaDia, { publicar: true, paradas: [{ zonaId: 1, desde: '08:00', hasta: '10:00' }] })
  @ApiUnprocessableEntityResponse({ description: 'ZONA_NO_VALIDA o RUTA_VACIA' })
  guardarRuta(@UsuarioActual() usuario: UsuarioSesion, @Body(new ValidarCon(esquemaRutaDia)) datos: RutaDia) {
    return this.dia.guardarRuta(usuario, datos);
  }

  @Put('mi-negocio/posicion')
  @ApiOperation({
    summary:
      'Comparte o deja de compartir tu posición aproximada de hoy, solo «En ruta». El servidor la redondea (~110 m), guarda un solo punto sin historial y se apaga al terminar el día en Lima',
  })
  @CuerpoZod(esquemaPosicionDia, { comparte: true, posicion: { lat: -15.4971234, lng: -70.1334567 } })
  @ApiConflictResponse({ description: 'NO_EN_RUTA' })
  compartir(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaPosicionDia)) datos: z.infer<typeof esquemaPosicionDia>,
  ) {
    return this.dia.compartirPosicion(usuario, datos);
  }
}
