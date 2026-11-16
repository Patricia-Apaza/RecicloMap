import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import {
  esquemaCambiarTelefono,
  esquemaConfirmarTelefono,
  esquemaCorreoCuenta,
  esquemaMateriales,
  esquemaPerfilReciclador,
  esquemaPreferenciasCuenta,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { PermiteEstados, Roles, UsuarioActual, type UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { UsuariosService } from './usuarios.service.js';

const EJEMPLO_PERFIL = {
  id: '7f6c…',
  nombre: 'Marco Quispe',
  rol: 'RECICLADOR',
  estado: 'ACTIVO',
  siguientePaso: 'LISTO',
  telefono: '900000001',
  correo: 'marco.quispe@reciclomap.test',
  correoVerificado: false,
  fotoId: null,
  zona: { id: 2, nombre: 'Barrio Santa Rosa' },
  sobreMi: 'Recojo en el mercado todos los días.',
  visibleEnRanking: true,
  ciudad: { id: 1, nombre: 'Juliaca' },
  materiales: [{ codigo: 'pet', nombre: 'PET' }],
  insignias: [{ codigo: 'semilla', nombre: 'Semilla', obtenidaEn: '2026-11-14T15:00:00.000Z' }],
};

@ApiTags('Mi cuenta')
@ApiBearerAuth()
@Controller('yo')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @PermiteEstados('ACTIVO', 'SUSPENDIDO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Datos de la cuenta propia y el siguiente paso pendiente' })
  @ApiOkResponse({ schema: { example: EJEMPLO_PERFIL } })
  perfil(@UsuarioActual() usuario: UsuarioSesion) {
    return this.usuarios.perfil(usuario.id);
  }

  @Put('materiales')
  @Roles('RECICLADOR')
  @ApiOperation({
    summary: 'Materiales que recolecta el reciclador (pantalla 04); la primera vez entrega la insignia Semilla',
  })
  @CuerpoZod(esquemaMateriales, { materiales: ['pet', 'carton'] })
  @ApiOkResponse({ schema: { example: EJEMPLO_PERFIL } })
  @ApiForbiddenResponse({ description: 'Solo recicladores' })
  guardarMateriales(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaMateriales)) datos: z.infer<typeof esquemaMateriales>,
  ) {
    return this.usuarios.guardarMateriales(usuario.id, datos.materiales);
  }

  @Patch('perfil')
  @Roles('RECICLADOR')
  @ApiOperation({
    summary: 'Editar perfil (pantalla 22): nombre, correo, zona y "sobre ti". El teléfono se cambia aparte',
  })
  @CuerpoZod(esquemaPerfilReciclador, {
    nombre: 'Marco Quispe',
    correo: 'marco@correo.pe',
    zonaId: 2,
    sobreMi: 'Recojo en el mercado.',
  })
  @ApiOkResponse({ schema: { example: EJEMPLO_PERFIL } })
  @ApiConflictResponse({ description: 'CORREO_EN_USO' })
  editarPerfil(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaPerfilReciclador)) datos: z.infer<typeof esquemaPerfilReciclador>,
  ) {
    return this.usuarios.editarPerfil(usuario.id, datos);
  }

  @Patch('correo')
  @ApiOperation({ summary: 'Cambiar el correo de la cuenta (cualquier rol). Queda sin verificar' })
  @CuerpoZod(esquemaCorreoCuenta, { correo: 'titicaca@acopio.pe' })
  @ApiConflictResponse({ description: 'CORREO_EN_USO' })
  editarCorreo(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaCorreoCuenta)) datos: z.infer<typeof esquemaCorreoCuenta>,
  ) {
    return this.usuarios.editarCorreo(usuario.id, datos.correo);
  }

  @Post('telefono/cambiar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envía un código por SMS al número nuevo. El cambio se aplica al confirmarlo' })
  @CuerpoZod(esquemaCambiarTelefono, { telefono: '987654321' })
  @ApiOkResponse({ schema: { example: { reenviarEn: 60 } } })
  @ApiConflictResponse({ description: 'TELEFONO_EN_USO' })
  @ApiTooManyRequestsResponse({ description: 'ESPERA_REENVIO o DEMASIADOS_CODIGOS' })
  cambiarTelefono(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaCambiarTelefono)) datos: z.infer<typeof esquemaCambiarTelefono>,
  ) {
    return this.usuarios.pedirCambioTelefono(usuario.id, datos.telefono);
  }

  @Post('telefono/confirmar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirma el número nuevo con el código. Envía un aviso de seguridad' })
  @CuerpoZod(esquemaConfirmarTelefono, { telefono: '987654321', codigo: '123456' })
  @ApiOkResponse({ schema: { example: EJEMPLO_PERFIL } })
  confirmarTelefono(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaConfirmarTelefono)) datos: z.infer<typeof esquemaConfirmarTelefono>,
  ) {
    return this.usuarios.confirmarCambioTelefono(usuario.id, datos.telefono, datos.codigo);
  }

  @Put('preferencias')
  @Roles('RECICLADOR')
  @ApiOperation({ summary: 'Privacidad (pantalla 39): aparecer o no en el ranking' })
  @CuerpoZod(esquemaPreferenciasCuenta, { visibleEnRanking: false })
  preferencias(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body(new ValidarCon(esquemaPreferenciasCuenta)) datos: z.infer<typeof esquemaPreferenciasCuenta>,
  ) {
    return this.usuarios.cambiarPreferencias(usuario.id, datos);
  }

  @Post('lista-espera/:ciudadId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Avisarme cuando RecicloMap abra en una ciudad "Próximamente"' })
  @ApiConflictResponse({ description: 'CIUDAD_ACTIVA' })
  listaEspera(@UsuarioActual() usuario: UsuarioSesion, @Param('ciudadId', ParseIntPipe) ciudadId: number) {
    return this.usuarios.listaEspera(usuario.id, ciudadId);
  }
}
