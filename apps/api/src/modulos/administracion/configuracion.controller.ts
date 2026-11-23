import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  esquemaCambiarParametro,
  esquemaDecisionAdmin,
  esquemaEntregarPremio,
  esquemaGuardarCatalogo,
  esquemaListaEntregas,
  esquemaNuevaCiudad,
  esquemaReponerStock,
  esquemaRequisitosCiudad,
  esquemaZona,
} from '@reciclomap/shared';
import { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { CiudadesAdminService } from './ciudades-admin.service.js';
import { ParametrosAdminService } from './parametros-admin.service.js';
import { PremiosAdminService } from './premios-admin.service.js';

@ApiTags('Administración · Parámetros')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/parametros')
export class ParametrosAdminController {
  constructor(private readonly parametros: ParametrosAdminService) {}

  @Get()
  @ApiOperation({
    summary:
      'Parámetros editables por grupo con su rango, valor actual y último cambio; los fijos del producto y los cambios recientes (pantallas 62 y 66)',
  })
  listar() {
    return this.parametros.listar();
  }

  @Get(':clave/historial')
  @ApiOperation({ summary: 'Historial de cambios de un parámetro' })
  @ApiNotFoundResponse()
  historial(@Param('clave') clave: string) {
    return this.parametros.historial(clave);
  }

  @Put(':clave')
  @CuerpoZod(esquemaCambiarParametro, { valor: 10, motivo: 'Ajuste acordado con el equipo' })
  @ApiOperation({
    summary:
      'Cambia un parámetro dentro de su rango, con motivo. Rige desde ese momento, nunca hacia atrás. Los que cambian cuántos premios se reparten exigen además `confirmarCosto`',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALOR_FUERA_DE_RANGO, VALOR_NO_VALIDO o CONFIRMACION_REQUERIDA' })
  @ApiConflictResponse({ description: 'SIN_CAMBIO' })
  cambiar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('clave') clave: string,
    @Body(new ValidarCon(esquemaCambiarParametro)) cuerpo: z.infer<typeof esquemaCambiarParametro>,
  ) {
    return this.parametros.cambiar(admin.id, clave, cuerpo);
  }
}

@ApiTags('Administración · Ciudades')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin')
export class CiudadesAdminController {
  constructor(private readonly ciudades: CiudadesAdminService) {}

  @Get('ciudades')
  @ApiOperation({ summary: 'Ciudades con zonas, requisitos de apertura y lista de espera (pantalla 63)' })
  listar() {
    return this.ciudades.listar();
  }

  @Post('ciudades')
  @CuerpoZod(esquemaNuevaCiudad, { nombre: 'Arequipa', region: 'Arequipa', motivo: 'Próxima ciudad a abrir' })
  @ApiOperation({ summary: 'Agrega una ciudad como «Próximamente»' })
  @ApiConflictResponse({ description: 'CIUDAD_REPETIDA' })
  crear(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaNuevaCiudad)) cuerpo: z.infer<typeof esquemaNuevaCiudad>,
  ) {
    return this.ciudades.crear(admin.id, cuerpo);
  }

  @Put('ciudades/:id/requisitos')
  @CuerpoZod(esquemaRequisitosCiudad, { verificadoresAsignados: true, motivo: 'Ya hay dos verificadores' })
  @ApiOperation({
    summary: 'Marca los requisitos de apertura que dependen del equipo (verificadores y precios base), con motivo',
  })
  requisitos(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidarCon(esquemaRequisitosCiudad)) cuerpo: z.infer<typeof esquemaRequisitosCiudad>,
  ) {
    return this.ciudades.requisitos(admin.id, id, cuerpo);
  }

  @Post('ciudades/:id/zonas')
  @HttpCode(201)
  @CuerpoZod(esquemaZona, { nombre: 'Centro', lat: -16.4, lng: -71.53, motivo: 'Zona inicial' })
  @ApiOperation({ summary: 'Agrega una zona a una ciudad, con su punto central' })
  @ApiConflictResponse({ description: 'ZONA_REPETIDA' })
  crearZona(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidarCon(esquemaZona)) cuerpo: z.infer<typeof esquemaZona>,
  ) {
    return this.ciudades.crearZona(admin.id, id, cuerpo);
  }

  @Put('zonas/:id')
  @CuerpoZod(esquemaZona, { nombre: 'Centro histórico', lat: -16.4, lng: -71.53, motivo: 'Corrección del nombre' })
  @ApiOperation({ summary: 'Cambia el nombre o el punto central de una zona' })
  editarZona(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidarCon(esquemaZona)) cuerpo: z.infer<typeof esquemaZona>,
  ) {
    return this.ciudades.editarZona(admin.id, id, cuerpo);
  }

  @Post('zonas/:id/eliminar')
  @HttpCode(200)
  @CuerpoZod(esquemaDecisionAdmin, { motivo: 'Zona creada por error', confirmar: true })
  @ApiOperation({ summary: 'Elimina una zona que nadie usa' })
  @ApiConflictResponse({ description: 'ZONA_EN_USO' })
  eliminarZona(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidarCon(esquemaDecisionAdmin)) cuerpo: z.infer<typeof esquemaDecisionAdmin>,
  ) {
    return this.ciudades.eliminarZona(admin.id, id, cuerpo.motivo);
  }

  @Post('ciudades/:id/activar')
  @HttpCode(200)
  @CuerpoZod(esquemaDecisionAdmin, { motivo: 'Lista para abrir', confirmar: true })
  @ApiOperation({
    summary:
      'Activa una ciudad solo con zonas, verificadores asignados y precios base cargados. Avisa una sola vez a quienes esperaban',
  })
  @ApiConflictResponse({ description: 'REQUISITOS_INCOMPLETOS o CIUDAD_YA_ACTIVA' })
  activar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidarCon(esquemaDecisionAdmin)) cuerpo: z.infer<typeof esquemaDecisionAdmin>,
  ) {
    return this.ciudades.activar(admin.id, id, cuerpo.motivo);
  }

  @Post('ciudades/:id/desactivar')
  @HttpCode(200)
  @CuerpoZod(esquemaDecisionAdmin, { motivo: 'Se abrió por error', confirmar: true })
  @ApiOperation({
    summary: 'Vuelve una ciudad a «Próximamente» solo si no tiene cuentas, publicaciones ni operaciones',
  })
  @ApiConflictResponse({ description: 'CIUDAD_EN_USO o CIUDAD_NO_ACTIVA' })
  desactivar(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidarCon(esquemaDecisionAdmin)) cuerpo: z.infer<typeof esquemaDecisionAdmin>,
  ) {
    return this.ciudades.desactivar(admin.id, id, cuerpo.motivo);
  }
}

@ApiTags('Administración · Premios y ruleta')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin')
export class PremiosAdminController {
  constructor(private readonly premios: PremiosAdminService) {}

  @Get('premios')
  @ApiOperation({
    summary: 'Catálogo de la ruleta con probabilidades, stock, vigencia y plazo de reclamo (pantalla 62)',
  })
  catalogo() {
    return this.premios.catalogo();
  }

  @Put('premios')
  @CuerpoZod(esquemaGuardarCatalogo, { motivo: 'Ajuste de probabilidades', premios: [] })
  @ApiOperation({
    summary:
      'Guarda el catálogo completo: los premios activos deben sumar exactamente 100 % con un solo «Sigue intentando». Un premio no se borra: se desactiva. Rige desde el próximo giro',
  })
  @ApiUnprocessableEntityResponse({ description: 'CATALOGO_NO_VALIDO o PREMIO_OMITIDO' })
  @ApiConflictResponse({ description: 'PREMIO_GANADO_BLOQUEADO' })
  guardar(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaGuardarCatalogo)) cuerpo: z.infer<typeof esquemaGuardarCatalogo>,
  ) {
    return this.premios.guardar(admin.id, cuerpo);
  }

  @Post('premios/:id/reponer')
  @HttpCode(200)
  @CuerpoZod(esquemaReponerStock, { cantidad: 20, motivo: 'Llegó una nueva entrega del aliado' })
  @ApiOperation({ summary: 'Repone stock de un premio con motivo (un premio vencido no devuelve stock solo)' })
  reponer(
    @UsuarioActual() admin: UsuarioSesion,
    @Param('id') id: string,
    @Body(new ValidarCon(esquemaReponerStock)) cuerpo: z.infer<typeof esquemaReponerStock>,
  ) {
    return this.premios.reponer(admin.id, id, cuerpo);
  }

  @Get('premios-entregas')
  @ConsultaZod('estado', esquemaListaEntregas.shape.estado)
  @ApiOperation({ summary: 'Cola de premios: por entregar (reclamados), por vencer, entregados y vencidos' })
  entregas(@Query(new ValidarCon(esquemaListaEntregas)) consulta: z.infer<typeof esquemaListaEntregas>) {
    return this.premios.entregas(consulta.estado);
  }

  @Post('premios-entregas')
  @HttpCode(200)
  @CuerpoZod(esquemaEntregarPremio, { codigo: 'RM-4F2K', nota: 'Lo recogió en persona' })
  @ApiOperation({
    summary: 'Marca como entregado un premio reclamado, con su código y una nota opcional. Avisa a la persona',
  })
  @ApiConflictResponse({ description: 'PREMIO_NO_RECLAMADO o PREMIO_YA_ENTREGADO' })
  entregar(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaEntregarPremio)) cuerpo: z.infer<typeof esquemaEntregarPremio>,
  ) {
    return this.premios.entregar(admin.id, cuerpo.codigo, cuerpo.nota);
  }

  @Post('ruleta/pausar')
  @HttpCode(200)
  @CuerpoZod(esquemaDecisionAdmin, { motivo: 'Revisión del catálogo', confirmar: true })
  @ApiOperation({
    summary: 'Pausa la ruleta: nadie gira, los giros se conservan y los premios ganados siguen reclamables',
  })
  @ApiConflictResponse({ description: 'RULETA_YA_EN_PAUSA' })
  pausar(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaDecisionAdmin)) cuerpo: z.infer<typeof esquemaDecisionAdmin>,
  ) {
    return this.premios.pausar(admin.id, cuerpo.motivo);
  }

  @Post('ruleta/reanudar')
  @HttpCode(200)
  @CuerpoZod(esquemaDecisionAdmin, { motivo: 'Catálogo revisado', confirmar: true })
  @ApiOperation({ summary: 'Reanuda la ruleta con motivo' })
  @ApiConflictResponse({ description: 'RULETA_YA_EN_MARCHA' })
  reanudar(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaDecisionAdmin)) cuerpo: z.infer<typeof esquemaDecisionAdmin>,
  ) {
    return this.premios.reanudar(admin.id, cuerpo.motivo);
  }
}
