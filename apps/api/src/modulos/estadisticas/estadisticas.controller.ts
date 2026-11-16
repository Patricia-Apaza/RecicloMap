import { Body, Controller, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { esquemaEstadisticas, esquemaVisita, type PeriodoEstadisticas } from '@reciclomap/shared';
import type { z } from 'zod';
import {
  Publica,
  Roles,
  UsuarioActual,
  UsuarioOpcional,
  type UsuarioSesion,
} from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod, CuerpoZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { EstadisticasService } from './estadisticas.service.js';

const EJEMPLO_PRO = { requierePro: true };

@ApiTags('Estadísticas del negocio')
@ApiBearerAuth()
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@ApiForbiddenResponse({ description: 'Solo negocios; cada uno ve únicamente lo suyo' })
@Controller('mi-negocio')
export class EstadisticasController {
  constructor(private readonly estadisticas: EstadisticasService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen del mes (pantalla 41): kilos, visitas, solicitudes de llegada y qué hacer hoy' })
  resumen(@UsuarioActual() usuario: UsuarioSesion) {
    return this.estadisticas.resumen(usuario);
  }

  @Get('estadisticas')
  @ApiOperation({
    summary: 'Estadísticas (pantallas 50 y 53). El plan Gratis no recibe los datos Pro: responde con `requierePro`',
    description:
      'Ambos planes: visitas, solicitudes de llegada (solo conteo, por material y día), ofertas, kilos comprados (solo completadas) y precio frente al mercado, en 7 o 30 días. Solo Pro: 90 días, horas con más visitas y materiales más consultados. Semáforo, precio y demanda son idénticos en ambos planes.',
  })
  @ConsultaZod('periodo', esquemaEstadisticas.shape.periodo, '7, 30 o 90 días; 30 por defecto')
  @ApiOkResponse({
    schema: {
      example: {
        periodo: 30,
        plan: 'GRATIS',
        sinDatos: false,
        visitas: { total: 12, serie: [{ desde: '2026-11-01', hasta: '2026-11-07', valor: 4 }] },
        horasConMasVisitas: EJEMPLO_PRO,
        materialesMasConsultados: EJEMPLO_PRO,
      },
    },
  })
  estadisticasDelNegocio(
    @UsuarioActual() usuario: UsuarioSesion,
    @Query(new ValidarCon(esquemaEstadisticas)) consulta: z.infer<typeof esquemaEstadisticas>,
  ) {
    return this.estadisticas.estadisticas(usuario, consulta.periodo as PeriodoEstadisticas);
  }
}

// La ficha del negocio avisa cuando se abre: una persona o dispositivo cuenta una vez por día
@ApiTags('Estadísticas del negocio')
@Controller('compradores')
export class VisitasController {
  constructor(private readonly estadisticas: EstadisticasService) {}

  @Post(':id/visitas')
  @Publica()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Registra una visita a la ficha. Cuentan invitados y recicladores, una vez por persona o dispositivo por día; no cuentan al propio negocio ni a la administración. Nunca se muestra quién visitó',
  })
  @CuerpoZod(esquemaVisita, { material: 'pet' })
  @ApiOkResponse({ schema: { example: { registrada: true } } })
  @ApiNotFoundResponse({ description: 'No existe o no está verificado' })
  visitar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidarCon(esquemaVisita)) cuerpo: z.infer<typeof esquemaVisita>,
    @UsuarioOpcional() usuario: UsuarioSesion | undefined,
    @Headers('x-dispositivo') dispositivo: string | undefined,
    @Headers('user-agent') agente: string | undefined,
    @Ip() ip: string,
  ) {
    const valido = dispositivo && /^[\w-]{8,64}$/.test(dispositivo) ? dispositivo : undefined;
    return this.estadisticas.registrarVisita(
      id,
      { usuario, dispositivo: valido, huella: `${ip}|${agente ?? ''}` },
      cuerpo.material ?? null,
    );
  }
}
