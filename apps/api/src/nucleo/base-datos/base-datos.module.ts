import { Global, Module } from '@nestjs/common';
import { PrismaAdmin, PrismaApi } from './prisma.js';

@Global()
@Module({
  providers: [PrismaApi, PrismaAdmin],
  exports: [PrismaApi, PrismaAdmin],
})
export class BaseDatosModule {}
