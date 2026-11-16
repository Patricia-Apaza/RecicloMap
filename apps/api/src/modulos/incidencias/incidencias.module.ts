import { Module } from '@nestjs/common';
import { JuegoModule } from '../juego/juego.module.js';
import { IncidenciasController } from './incidencias.controller.js';
import { IncidenciasService } from './incidencias.service.js';

@Module({
  imports: [JuegoModule],
  controllers: [IncidenciasController],
  providers: [IncidenciasService],
})
export class IncidenciasModule {}
