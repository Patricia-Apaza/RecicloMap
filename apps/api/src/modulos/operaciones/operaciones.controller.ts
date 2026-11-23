import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  type DatosCalificacion,
  type DatosCoordinacion,
  esquemaCalificar,
  esquemaConfirmarRecepcion,
  esquemaCoordinar,
  esquemaDetalleIncidencia,
  esquemaFiltroHistorial,
  esquemaMotivoOperacion,
  esquemaProblemaOperacion,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { OperacionesService } from './operaciones.service.js';

const EJEMPLO = {
  id: '7d…',
  estado: 'EN_COORDINACION',
  enDisputa: false,
  rol: 'RECICLADOR',
  material: { codigo: 'metal', nombre: 'Metales' },
  kg: 18,
  precioKg: '2.60',
  total: '46.80',
  kgFinal: null,
  montoFinal: null,
  contraparte: {
    tipo: 'CENTRO',
    nombre: 'EcoAcopio Juliaca',
    whatsapp: '900000012',
    direccion: 'Av. Independencia 1120',
  },
  coordinacion: { tipo: 'LOCAL_DEL_CENTRO', referencia: null, dia: '2026-11-18', franja: 'TARDE' },
  acciones: ['coordinar', 'entregar', 'cancelar'],
};

@ApiTags('Operaciones')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Solo las dos partes de la operación, y cada una solo sus acciones' })
@ApiNotFoundResponse({ description: 'No existe o no participo en ella' })
@Roles('RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL')
@Controller('operaciones')
export class OperacionesController {
  constructor(private readonly operaciones: OperacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Mi historial de operaciones con indicadores (pantallas 28 y 51)' })
  @ConsultaZod('estado', esquemaFiltroHistorial.shape.estado)
  @ConsultaZod('material', esquemaFiltroHistorial.shape.material)
  historial(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroHistorial)) filtro: z.infer<typeof esquemaFiltroHistorial>,
  ) {
    return this.operaciones.historial(usuario, filtro.estado, filtro.material);
  }

  @Get('exportar')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="historial-reciclomap.csv"')
  @ApiOperation({ summary: 'Historial en CSV con los mismos filtros' })
  @ApiProduces('text/csv')
  @ConsultaZod('estado', esquemaFiltroHistorial.shape.estado)
  @ConsultaZod('material', esquemaFiltroHistorial.shape.material)
  exportar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaFiltroHistorial)) filtro: z.infer<typeof esquemaFiltroHistorial>,
  ) {
    return this.operaciones.csv(usuario, filtro.estado, filtro.material);
  }

  @Get('problemas/mios')
  @ApiOperation({ summary: 'Mis reportes de problemas de operaciones y su estado' })
  @ApiOkResponse({
    schema: {
      example: {
        datos: [{ id: 'r1…', motivo: 'PAGO', estado: 'PENDIENTE', decision: null, operacion: { material: 'PET' } }],
      },
    },
  })
  problemasMios(@UsuarioActual() usuario: UsuarioSesion) {
    return this.operaciones.misIncidencias(usuario);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Seguimiento compartido (pantalla 26): estado, fechas, punto de encuentro, plazos y mis acciones',
  })
  @ApiOkResponse({ schema: { example: EJEMPLO } })
  detalle(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.operaciones.detalle(usuario, id);
  }

  @Post(':id/coordinar')
  @HttpCode(200)
  @Roles('RECICLADOR')
  @ApiOperation({
    summary: 'El reciclador define el punto de encuentro (pantalla 25) y puede proponer día y franja',
    description:
      '"LOCAL_DEL_CENTRO" solo si el comprador es un centro; si no, una referencia en texto con pin opcional. Nunca se precarga la ubicación del reciclador. Pasa a EN_COORDINACION y avisa al negocio.',
  })
  @CuerpoZod(esquemaCoordinar, {
    tipo: 'REFERENCIA',
    referencia: 'Esquina de Jr. Moquegua con Av. Huancané, frente a la farmacia',
    dia: '2026-11-18',
    franja: 'TARDE',
    mensaje: 'Llevo todo en costales.',
  })
  @ApiConflictResponse({ description: 'OPERACION_NO_COORDINABLE' })
  coordinar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaCoordinar)) datos: DatosCoordinacion,
  ) {
    return this.operaciones.coordinar(usuario, id, datos);
  }

  @Post(':id/entregar')
  @HttpCode(200)
  @Roles('RECICLADOR')
  @ApiOperation({ summary: '"Ya entregué". Arranca el plazo de 72 h para el aviso de entrega sin confirmar' })
  @ApiConflictResponse({ description: 'OPERACION_NO_ENTREGABLE' })
  entregar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.operaciones.entregar(usuario, id);
  }

  @Post(':id/confirmar')
  @HttpCode(200)
  @Roles('CENTRO', 'COMPRADOR_MOVIL')
  @ApiOperation({
    summary: '"Recibí" con los kilos recibidos (obligatorios). Fija kilos y monto final; el pago es fuera de la app',
    description: 'También corrige los kilos cuando un administrador lo pidió. Arranca el plazo de 72 h de conformidad.',
  })
  @CuerpoZod(esquemaConfirmarRecepcion, { kgRecibidos: 17.5 })
  @ApiConflictResponse({ description: 'OPERACION_NO_CONFIRMABLE' })
  confirmar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaConfirmarRecepcion)) cuerpo: z.infer<typeof esquemaConfirmarRecepcion>,
  ) {
    return this.operaciones.confirmar(usuario, id, cuerpo.kgRecibidos);
  }

  @Post(':id/conforme')
  @HttpCode(200)
  @Roles('RECICLADOR')
  @ApiOperation({
    summary: '"Conforme": completa la operación en una sola transacción',
    description:
      'Kilos acumulados, 1 punto por kg en un único movimiento, giros por cada 500 puntos, nivel y publicación FINALIZADA.',
  })
  @ApiConflictResponse({ description: 'OPERACION_NO_CONFIRMADA' })
  conforme(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.operaciones.conforme(usuario, id);
  }

  @Post(':id/no-conforme')
  @HttpCode(200)
  @Roles('RECICLADOR')
  @ApiOperation({
    summary: '"No conforme": abre una incidencia, detiene el plazo y avisa al negocio y a la administración',
  })
  @CuerpoZod(esquemaDetalleIncidencia, { detalle: 'Entregué 18 kg y confirmaron 12 kg.' })
  @ApiConflictResponse({ description: 'OPERACION_NO_CONFIRMADA' })
  noConforme(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaDetalleIncidencia)) cuerpo: z.infer<typeof esquemaDetalleIncidencia>,
  ) {
    return this.operaciones.noConforme(usuario, id, cuerpo.detalle);
  }

  @Post(':id/incidencia')
  @HttpCode(200)
  @Roles('RECICLADOR')
  @ApiOperation({ summary: 'Incidencia por entrega sin confirmar: disponible a las 72 h en ENTREGADA' })
  @CuerpoZod(esquemaDetalleIncidencia, { detalle: 'Entregué el material y no confirman la recepción.' })
  @ApiConflictResponse({ description: 'INCIDENCIA_NO_DISPONIBLE' })
  incidencia(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaDetalleIncidencia)) cuerpo: z.infer<typeof esquemaDetalleIncidencia>,
  ) {
    return this.operaciones.abrirIncidencia(usuario, id, cuerpo.detalle);
  }

  @Post(':id/problema')
  @HttpCode(201)
  @ApiOperation({
    summary:
      '"Hubo un problema" (pantalla 29): no llegó, peso, pago, trato u otro. Crea una incidencia para la administración; no cambia la operación',
  })
  @CuerpoZod(esquemaProblemaOperacion, { tipo: 'PAGO', detalle: 'Acordamos S/ 2.60 por kg y me pagaron S/ 2.20.' })
  @ApiConflictResponse({ description: 'YA_REPORTADO' })
  problema(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaProblemaOperacion)) cuerpo: z.infer<typeof esquemaProblemaOperacion>,
  ) {
    return this.operaciones.reportarProblema(usuario, id, cuerpo.tipo, cuerpo.detalle);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancela con motivo, antes de la entrega. La publicación queda cancelada y se avisa a la otra parte',
  })
  @CuerpoZod(esquemaMotivoOperacion, { motivo: 'No llegamos a un acuerdo' })
  @ApiConflictResponse({ description: 'OPERACION_NO_CANCELABLE' })
  cancelar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaMotivoOperacion)) cuerpo: z.infer<typeof esquemaMotivoOperacion>,
  ) {
    return this.operaciones.cancelar(usuario, id, cuerpo.motivo);
  }

  @Post(':id/calificacion')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Califica a la otra parte (pantalla 27): una por autor y operación, solo tras COMPLETADA',
    description: 'Etiquetas por código, de la dirección que corresponde (al negocio o al reciclador).',
  })
  @CuerpoZod(esquemaCalificar, {
    estrellas: 5,
    etiquetas: ['puntual', 'pago_lo_acordado'],
    comentario: 'Pesaron frente a mí.',
  })
  @ApiConflictResponse({ description: 'YA_CALIFICADA u OPERACION_NO_COMPLETADA' })
  calificar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaCalificar)) datos: DatosCalificacion,
  ) {
    return this.operaciones.calificar(usuario, id, datos);
  }
}
