import { Module } from '@nestjs/common';
import { JuegoModule } from '../juego/juego.module.js';
import { NegociosModule } from '../negocios/negocios.module.js';
import { ComprasController } from './compras.controller.js';
import { OperacionesController } from './operaciones.controller.js';
import { OperacionesService } from './operaciones.service.js';
import { OperacionesTareas } from './operaciones-tareas.js';

@Module({
  imports: [NegociosModule, JuegoModule],
  controllers: [OperacionesController, ComprasController],
  providers: [OperacionesService, OperacionesTareas],
})
export class OperacionesModule {}
