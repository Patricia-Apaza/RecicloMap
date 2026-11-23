import { Module } from '@nestjs/common';
import { DireccionesController } from './direcciones.controller.js';
import { Geocodificador } from './geocodificador.service.js';

@Module({ controllers: [DireccionesController], providers: [Geocodificador] })
export class DireccionesModule {}
