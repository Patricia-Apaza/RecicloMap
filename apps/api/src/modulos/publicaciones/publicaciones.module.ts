import { Module } from '@nestjs/common';
import { NegocioPublicacionesController } from './negocio-publicaciones.controller.js';
import { NegocioPublicacionesService } from './negocio-publicaciones.service.js';
import { OfertasRecibidasController, PublicacionesController } from './publicaciones.controller.js';
import { PublicacionesRepositorio } from './publicaciones.repositorio.js';
import { PublicacionesService } from './publicaciones.service.js';
import { PublicacionesTareas } from './publicaciones-tareas.js';

@Module({
  controllers: [PublicacionesController, OfertasRecibidasController, NegocioPublicacionesController],
  providers: [PublicacionesRepositorio, PublicacionesService, NegocioPublicacionesService, PublicacionesTareas],
  exports: [NegocioPublicacionesService],
})
export class PublicacionesModule {}
