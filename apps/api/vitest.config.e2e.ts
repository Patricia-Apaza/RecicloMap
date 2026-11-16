import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/preparacion-e2e.ts'],
    env: {
      RM_BD_OBJETIVO: 'pruebas',
      NODE_ENV: 'test',
      MENSAJERIA_PROVEEDOR: 'memoria',
      MENSAJERIA_EXPONER_CODIGO: 'true',
      ALMACEN_PROVEEDOR: 'memoria',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
