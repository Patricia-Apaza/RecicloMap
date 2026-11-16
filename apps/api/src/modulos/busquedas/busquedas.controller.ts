import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { esquemaBusquedaGuardada } from '@reciclomap/shared';
import type { z } from 'zod';
import { Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { BusquedasService } from './busquedas.service.js';

@ApiTags('Búsquedas guardadas')
@ApiBearerAuth()
@Roles('RECICLADOR')
@Controller('busquedas')
export class BusquedasController {
  constructor(private readonly busquedas: BusquedasService) {}

  @Get()
  @ApiOperation({ summary: 'Mis búsquedas guardadas (pantalla 11)' })
  listar(@UsuarioActual() usuario: UsuarioSesion) {
    return this.busquedas.listar(usuario.id);
  }

  @Post()
  @ApiOperation({ summary: 'Guarda los filtros actuales (máximo 5 búsquedas)' })
  @CuerpoZod(esquemaBusquedaGuardada, {
    nombre: 'PET · centros · 5 km',
    filtros: { material: 'pet', radio: 5, tipo: 'centro' },
  })
  @ApiConflictResponse({ description: 'Ya tiene 5 búsquedas guardadas' })
  guardar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaBusquedaGuardada)) busqueda: z.infer<typeof esquemaBusquedaGuardada>,
  ) {
    return this.busquedas.guardar(usuario.id, busqueda);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Borra una búsqueda guardada' })
  @ApiNoContentResponse()
  borrar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.busquedas.borrar(usuario.id, id);
  }
}
