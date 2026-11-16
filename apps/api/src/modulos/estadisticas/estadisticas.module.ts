import { Module } from '@nestjs/common';
import { PreciosModule } from '../precios/precios.module.js';
import { PublicacionesModule } from '../publicaciones/publicaciones.module.js';
import { EstadisticasController, VisitasController } from './estadisticas.controller.js';
import { EstadisticasService } from './estadisticas.service.js';

@Module({
  imports: [PreciosModule, PublicacionesModule],
  controllers: [EstadisticasController, VisitasController],
  providers: [EstadisticasService],
})
export class EstadisticasModule {}
