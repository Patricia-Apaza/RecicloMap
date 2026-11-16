import { Module } from '@nestjs/common';
import { ResenasController } from './resenas.controller.js';
import { ResenasService } from './resenas.service.js';

@Module({
  controllers: [ResenasController],
  providers: [ResenasService],
})
export class ResenasModule {}
