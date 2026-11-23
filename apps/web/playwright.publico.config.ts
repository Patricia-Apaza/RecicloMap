import { defineConfig, devices } from '@playwright/test';

// Pruebas contra el enlace público de la demostración (túnel): URL_PUBLICA=https://... pnpm --filter @reciclomap/web test:publico
const URL_PUBLICA = process.env.URL_PUBLICA;
if (!URL_PUBLICA) throw new Error('Falta URL_PUBLICA: la dirección pública del túnel.');

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['flujos/demo-publica.spec.ts', 'flujos/guion-demo.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: URL_PUBLICA,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    geolocation: { latitude: -15.493, longitude: -70.129 },
    permissions: ['geolocation'],
  },
  projects: [
    { name: 'movil-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, hasTouch: true } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
