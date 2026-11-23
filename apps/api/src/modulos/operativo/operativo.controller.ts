import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaBanner, esquemaMantenimiento, esquemaRegistroAbierto } from '@reciclomap/shared';
import type { z } from 'zod';
import { Publica, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { ControlesAdminService } from './controles-admin.service.js';
import { OperativoService } from './operativo.service.js';

@ApiTags('Estado de la plataforma')
@Controller('estado')
export class EstadoController {
  constructor(private readonly operativo: OperativoService) {}

  @Get()
  @Publica()
  @ApiOperation({
    summary:
      'Aviso global vigente, si el registro está abierto para recicladores y negocios y si hay mantenimiento. Lo ve todo el mundo, también el invitado',
  })
  @ApiOkResponse({
    schema: {
      example: {
        ahora: '2026-11-17T15:00:00.000Z',
        banner: { id: 3, texto: 'Mañana, mantenimiento de 2 a 3 a. m.', hasta: '2026-11-18T10:00:00.000Z' },
        registro: { reciclador: true, negocio: true },
        mantenimiento: { activo: false, mensaje: null, desde: null },
      },
    },
  })
  estado() {
    return this.operativo.estadoPublico();
  }
}

@ApiTags('Administración · Controles operativos')
@ApiBearerAuth()
@Roles('ADMIN')
@ApiForbiddenResponse({ description: 'Solo administración' })
@Controller('admin/controles')
export class ControlesAdminController {
  constructor(private readonly controles: ControlesAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Aviso global, registro, mantenimiento y los últimos cambios (pantalla 66)' })
  resumen() {
    return this.controles.resumen();
  }

  @Put('banner')
  @HttpCode(200)
  @CuerpoZod(esquemaBanner, {
    texto: 'Mañana, mantenimiento de 2 a 3 a. m.',
    desde: '2026-11-17T00:00:00-05:00',
    hasta: '2026-11-19T00:00:00-05:00',
    motivo: 'Aviso del mantenimiento',
  })
  @ApiOperation({
    summary: 'Publica o retira el aviso global (máximo 140 caracteres, con inicio y fin). Con `texto: null` se retira',
  })
  banner(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaBanner)) cuerpo: z.infer<typeof esquemaBanner>,
  ) {
    return this.controles.banner(admin.id, cuerpo);
  }

  @Put('registro')
  @HttpCode(200)
  @CuerpoZod(esquemaRegistroAbierto, { reciclador: false, motivo: 'Cupo de la etapa de pruebas' })
  @ApiOperation({
    summary:
      'Abre o cierra el registro de recicladores y el de negocios por separado (incluye Google). Las cuentas existentes no se afectan',
  })
  registro(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaRegistroAbierto)) cuerpo: z.infer<typeof esquemaRegistroAbierto>,
  ) {
    return this.controles.registro(admin.id, cuerpo);
  }

  @Put('mantenimiento')
  @HttpCode(200)
  @CuerpoZod(esquemaMantenimiento, {
    activo: true,
    mensaje: 'Estamos mejorando RecicloMap. Vuelve en unos minutos.',
    motivo: 'Actualización programada',
    confirmar: true,
  })
  @ApiOperation({
    summary:
      'Activa o desactiva el modo mantenimiento: solo lectura para todos menos la administración. Al terminar, los plazos vigentes se corren lo que duró',
  })
  @ApiConflictResponse({ description: 'MANTENIMIENTO_YA_ACTIVO o MANTENIMIENTO_NO_ACTIVO' })
  mantenimiento(
    @UsuarioActual() admin: UsuarioSesion,
    @Body(new ValidarCon(esquemaMantenimiento)) cuerpo: z.infer<typeof esquemaMantenimiento>,
  ) {
    return this.controles.mantenimiento(admin.id, cuerpo);
  }
}
