import { Module } from '@nestjs/common';
import { NegociosController } from './negocios.controller.js';
import { NegociosRepositorio } from './negocios.repositorio.js';
import { DatosNegocioService } from './datos-negocio.service.js';
import { NegociosService } from './negocios.service.js';

@Module({
  controllers: [NegociosController],
  providers: [NegociosService, NegociosRepositorio, DatosNegocioService],
  exports: [NegociosRepositorio],
})
export class NegociosModule {}
