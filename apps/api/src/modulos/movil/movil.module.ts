import { Module } from '@nestjs/common';
import { NegociosModule } from '../negocios/negocios.module.js';
import { DiaMovilService } from './dia-movil.service.js';
import { MovilController } from './movil.controller.js';
import { MovilService } from './movil.service.js';

@Module({
  imports: [NegociosModule],
  controllers: [MovilController],
  providers: [MovilService, DiaMovilService],
})
export class MovilModule {}
