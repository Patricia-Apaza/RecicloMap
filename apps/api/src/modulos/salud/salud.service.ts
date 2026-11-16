import { Injectable } from '@nestjs/common';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';

@Injectable()
export class SaludService {
  constructor(private readonly prisma: PrismaApi) {}

  async baseDatosResponde(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
