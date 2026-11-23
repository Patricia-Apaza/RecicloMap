import { defineConfig } from 'prisma/config';
import { urlPropietarioActual } from './src/nucleo/base-datos/conexiones.js';

// Generar el cliente no necesita conexión; migrar y sembrar sí
function urlSiHayConfiguracion(): string | undefined {
  return process.env.DB_PROPIETARIO_CLAVE ? urlPropietarioActual() : undefined;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: urlSiHayConfiguracion(),
  },
});
