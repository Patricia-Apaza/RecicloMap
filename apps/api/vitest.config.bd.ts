import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/bd/**/*.spec.ts'],
    globalSetup: ['test/bd/preparacion-global.ts'],
    // Todas las pruebas comparten la misma base de datos
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
