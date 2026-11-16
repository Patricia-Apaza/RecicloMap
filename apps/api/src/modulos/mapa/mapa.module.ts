import { Module } from '@nestjs/common';
import { CalculadoraController, MapaController } from './mapa.controller.js';
import { MapaRepositorio } from './mapa.repositorio.js';
import { MapaService } from './mapa.service.js';
import { RutasGoogle } from './rutas-google.js';

@Module({
  controllers: [MapaController, CalculadoraController],
  providers: [MapaRepositorio, MapaService, RutasGoogle],
  exports: [MapaRepositorio, MapaService],
})
export class MapaModule {}
