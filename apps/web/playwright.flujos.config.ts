import { defineConfig, devices } from '@playwright/test';

const PUERTO_WEB = 3102;
const PUERTO_API = 3101;

// Flujos completos contra la API real y la base de pruebas, que se recrea al arrancar
export default defineConfig({
  testDir: 'e2e/flujos',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-flujos' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'movil-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, hasTouch: true } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @reciclomap/api pruebas:servir',
      url: `http://localhost:${PUERTO_API}/api/v1/salud/listo`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        RM_BD_OBJETIVO: 'pruebas',
        NODE_ENV: 'test',
        API_PUERTO: String(PUERTO_API),
        WEB_ORIGEN: `http://localhost:${PUERTO_WEB}`,
        MENSAJERIA_PROVEEDOR: 'memoria',
        MENSAJERIA_EXPONER_CODIGO: 'true',
        ALMACEN_PROVEEDOR: 'memoria',
        API_LIMITE_POR_MINUTO: '5000',
        API_LIMITE_ACCESO_POR_MINUTO: '1000',
        API_LIMITE_REFRESCO_POR_MINUTO: '5000',
        AUTH_CODIGOS_POR_HORA: '50',
        GOOGLE_MAPS_CLAVE_NAVEGADOR: 'clave-de-pruebas',
      },
    },
    {
      command: `pnpm exec next start --port ${PUERTO_WEB}`,
      url: `http://localhost:${PUERTO_WEB}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_URL_INTERNA: `http://localhost:${PUERTO_API}` },
    },
  ],
});
