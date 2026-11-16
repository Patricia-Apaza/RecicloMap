import { Module } from '@nestjs/common';
import { AvisosPublicosController, MisAvisosController } from './avisos.controller.js';
import { AvisosService } from './avisos.service.js';

@Module({ controllers: [MisAvisosController, AvisosPublicosController], providers: [AvisosService] })
export class AvisosModule {}
