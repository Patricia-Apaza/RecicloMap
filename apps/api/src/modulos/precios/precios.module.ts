import { Module } from '@nestjs/common';
import { MapaModule } from '../mapa/mapa.module.js';
import { NegociosModule } from '../negocios/negocios.module.js';
import { PreciosAviso } from './precios-aviso.js';
import { PreciosController } from './precios.controller.js';
import { PreciosService } from './precios.service.js';

@Module({
  imports: [MapaModule, NegociosModule],
  controllers: [PreciosController],
  providers: [PreciosService, PreciosAviso],
  exports: [PreciosService],
})
export class PreciosModule {}
