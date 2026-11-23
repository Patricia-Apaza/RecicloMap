import { defineConfig, devices } from '@playwright/test';

const PUERTO = 3100;

// Se prueba la compilación de producción, que es lo que reciben los usuarios
export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'flujos/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'movil-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, hasTouch: true } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
