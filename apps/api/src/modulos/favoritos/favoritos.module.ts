import { Module } from '@nestjs/common';
import { MapaModule } from '../mapa/mapa.module.js';
import { FavoritosController } from './favoritos.controller.js';
import { FavoritosService } from './favoritos.service.js';

@Module({
  imports: [MapaModule],
  controllers: [FavoritosController],
  providers: [FavoritosService],
})
export class FavoritosModule {}
