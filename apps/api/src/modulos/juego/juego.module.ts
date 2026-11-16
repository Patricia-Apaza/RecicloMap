import { Module } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { EntregasDelNegocioController, RegistrosDirectosController } from './entregas.controller.js';
import { EntregasService } from './entregas.service.js';
import { JuegoController } from './juego.controller.js';
import { JuegoService } from './juego.service.js';
import { ProgresoService } from './progreso.service.js';
import { primerDiaDelMes } from './semanas.js';

// Los desafíos del mes nuevo existen desde el día 1 a las 00:00 de Lima
@Injectable()
export class JuegoTareas {
  constructor(private readonly progreso: ProgresoService) {}

  @Cron('1 0 * * *', { name: 'desafios-del-mes', timeZone: 'America/Lima' })
  async crearDesafios(): Promise<void> {
    await this.progreso.asegurarDesafiosDelMes(primerDiaDelMes(hoyEnLima()));
  }
}

@Module({
  imports: [NotificacionesModule],
  controllers: [JuegoController, RegistrosDirectosController, EntregasDelNegocioController],
  providers: [JuegoService, ProgresoService, EntregasService, JuegoTareas],
  exports: [ProgresoService],
})
export class JuegoModule {}
