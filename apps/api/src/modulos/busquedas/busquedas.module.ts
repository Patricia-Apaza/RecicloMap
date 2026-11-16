import { Module } from '@nestjs/common';
import { BusquedasController } from './busquedas.controller.js';
import { BusquedasService } from './busquedas.service.js';

@Module({
  controllers: [BusquedasController],
  providers: [BusquedasService],
})
export class BusquedasModule {}
