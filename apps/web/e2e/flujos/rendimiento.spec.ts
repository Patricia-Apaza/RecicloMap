import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { CLAVE_SEMILLA, ingresar, simularGoogleMaps, esperarRed } from './apoyo';

// Presupuesto de peso de la primera carga, en bytes transferidos (comprimidos), con 3G simulado. Máximo del producto: 1 MB
const MAXIMO = 1_000_000;
const ORIGEN = { latitude: -15.493, longitude: -70.129 };
// Una tesela real de OpenStreetMap sobre Juliaca pesa 15–38 KB (medido): se simula la más pesada, sobre la imagen mínima válida
const TESELA_PESADA = Buffer.concat([
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  ),
  Buffer.alloc(38_000, 1),
]);
test.use({ geolocation: ORIGEN, permissions: ['geolocation'] });

// 3G rápida de Chrome: 1,6 Mbps de bajada, 750 kbps de subida y 150 ms de latencia
async function limitarA3G(page: Page) {
  const sesion = await page.context().newCDPSession(page);
  await sesion.send('Network.enable');
  await sesion.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  const bytes = new Map<string, number>();
  let google = 0;
  sesion.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) =>
    bytes.set(e.requestId, e.encodedDataLength),
  );
  sesion.on('Network.requestWillBeSent', (e: { request: { url: string } }) => {
    if (/maps\.googleapis\.com|maps\.gstatic\.com/.test(e.request.url)) google += 1;
  });
  return { total: () => [...bytes.values()].reduce((a, b) => a + b, 0), llamadasAGoogle: () => google };
}

const pantallas: Array<{ nombre: string; ruta: string; como?: 'reciclador' | 'negocio'; esperar: string }> = [
  { nombre: 'bienvenida', ruta: '/', esperar: 'h1' },
  { nombre: 'ingreso', ruta: '/ingresar', esperar: 'h1' },
  { nombre: 'mapa y lista', ruta: '/mapa/lista', como: 'reciclador', esperar: 'h1' },
  { nombre: 'mapa con teselas', ruta: '/mapa', como: 'reciclador', esperar: 'h1' },
  { nombre: 'ficha del negocio', ruta: '/mapa/lista', como: 'reciclador', esperar: 'h1' },
  { nombre: 'publicar', ruta: '/publicar', como: 'reciclador', esperar: 'h1' },
  { nombre: 'historial', ruta: '/historial', como: 'reciclador', esperar: 'h1' },
  { nombre: 'panel del negocio', ruta: '/negocio', como: 'negocio', esperar: 'h1' },
];

test.describe.serial('presupuesto de peso: primera carga bajo 1 MB en 3G simulado', () => {
  const medidas: Array<{ pantalla: string; kb: number; presupuesto: number }> = [];
  test.afterAll(() => {
    const tabla = medidas.map((m) => `${m.pantalla}: ${m.kb} KB de ${m.presupuesto / 1000} KB`).join('\n');
    writeFileSync('test-results/presupuesto-de-peso.txt', `${tabla}\n`);
    console.log(`PRESUPUESTO_DE_PESO\n${tabla}`);
  });

  for (const p of pantallas) {
    test(`${p.nombre}`, async ({ browser }, info) => {
      const contexto = await browser.newContext({
        baseURL: info.project.use.baseURL,
        viewport: info.project.use.viewport,
        geolocation: ORIGEN,
        permissions: ['geolocation'],
      });
      const page = await contexto.newPage();
      await simularGoogleMaps(page);
      // Sesión primero (sin medir) y luego, con la caché del navegador vacía de la pantalla, se mide solo la carga fría de la pantalla
      if (p.como) {
        await ingresar(page, p.como === 'negocio' ? '900000011' : '900000001', CLAVE_SEMILLA);
        await expect(page).toHaveURL(p.como === 'negocio' ? /\/negocio$/ : /\/mapa$/);
      }
      // La carga fría se mide en un contexto nuevo (sin caché ni memoria de la pantalla anterior) que conserva solo la sesión
      const sesion = await contexto.storageState();
      await contexto.close();
      const frio = await browser.newContext({
        baseURL: info.project.use.baseURL,
        viewport: info.project.use.viewport,
        geolocation: ORIGEN,
        permissions: ['geolocation'],
        serviceWorkers: 'block',
        storageState: sesion,
      });
      const nueva = await frio.newPage();
      // Un celular en 3G lo informa así al navegador: el mapa pide menos imágenes
      await nueva.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', {
          value: { effectiveType: '3g', saveData: false },
          configurable: true,
        });
      });
      await simularGoogleMaps(nueva);
      await nueva.route('https://tile.openstreetmap.org/**', (ruta) =>
        ruta.fulfill({ body: TESELA_PESADA, contentType: 'image/png' }),
      );
      const medidor = await limitarA3G(nueva);
      await nueva.goto(p.ruta, { waitUntil: 'load' });
      await esperarRed(nueva);
      if (p.nombre === 'mapa con teselas') {
        await nueva
          .getByRole('button', { name: 'Usar mi ubicación' })
          .click()
          .catch(() => undefined);
        await expect(nueva.locator('[data-mapa="osm"] .leaflet-tile-loaded').first()).toBeAttached({ timeout: 20_000 });
        await esperarRed(nueva);
      }
      if (p.nombre === 'ficha del negocio') {
        await nueva
          .getByRole('button', { name: 'Usar mi ubicación' })
          .click()
          .catch(() => undefined);
        const detalle = nueva.getByRole('link', { name: 'Ver detalle' }).first();
        await detalle.waitFor();
        await detalle.click();
        await esperarRed(nueva);
      }
      const total = medidor.total();
      medidas.push({
        pantalla: `${p.nombre} (${info.project.name})`,
        kb: Math.round(total / 1000),
        presupuesto: MAXIMO,
      });
      expect(total, `${p.nombre} pesó ${Math.round(total / 1000)} KB`).toBeLessThan(MAXIMO);
      // El script de Google Maps no se pide en pantallas que no lo usan
      if (['bienvenida', 'ingreso', 'historial', 'panel del negocio'].includes(p.nombre)) {
        expect(medidor.llamadasAGoogle(), `${p.nombre} no debería cargar Google Maps`).toBe(0);
      }
      await frio.close();
    });
  }
});
