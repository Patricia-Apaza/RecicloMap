import { Module } from '@nestjs/common';
import { VerificacionesController } from './verificaciones.controller.js';
import { VerificacionesService } from './verificaciones.service.js';

@Module({
  controllers: [VerificacionesController],
  providers: [VerificacionesService],
})
export class VerificacionesModule {}
