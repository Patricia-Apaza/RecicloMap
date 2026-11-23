import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generado/prisma/client.js';
import { urlBd } from './conexiones.js';

// Conexión de uso general: no puede leer la ubicación de las publicaciones
@Injectable()
export class PrismaApi extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: urlBd('api') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// Conexión del módulo de administración: solo lectura sobre precios
@Injectable()
export class PrismaAdmin extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: urlBd('admin') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
