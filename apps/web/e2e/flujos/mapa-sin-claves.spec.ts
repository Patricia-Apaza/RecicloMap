import { expect, type Page, test } from '@playwright/test';
import { CLAVE_SEMILLA, ingresar, simularGoogleMaps, esperarRed } from './apoyo';

const ORIGEN = { latitude: -15.493, longitude: -70.129 };
const TESELA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

type ConfigMapa = { proveedor: string; teselas: unknown; google: unknown; pinObligatorio: boolean };

// Cambia el proveedor desde la configuración pública, igual que lo haría el servidor con otras variables de entorno
async function conProveedor(page: Page, cambio: Partial<ConfigMapa>): Promise<void> {
  await page.route('**/api/v1/configuracion-publica', async (ruta) => {
    const original = await ruta.fetch();
    const cuerpo = (await original.json()) as { mapa: ConfigMapa };
    await ruta.fulfill({ response: original, json: { ...cuerpo, mapa: { ...cuerpo.mapa, ...cambio } } });
  });
}

async function abrirMapaComoInvitado(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar como invitado' }).first().click();
  await expect(page).toHaveURL(/\/mapa$/);
  await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
  await page.getByRole('group', { name: 'Radio' }).getByRole('button', { name: '10 km' }).click();
}

const lista = (page: Page) =>
  page.getByRole('region', { name: 'Filtros y resultados' }).getByRole('button', { name: /por kilo/ });

test.describe('el mapa funciona sin ninguna clave', () => {
  test.use({ geolocation: ORIGEN, permissions: ['geolocation'] });
  test.beforeEach(async ({ page }) => {
    await simularGoogleMaps(page);
  });

  test('OpenStreetMap con su atribución visible abajo a la derecha, y ningún servicio de Google', async ({ page }) => {
    const hosts = new Set<string>();
    const referer: string[] = [];
    page.on('request', (peticion) => {
      const url = new URL(peticion.url());
      hosts.add(url.hostname);
      if (url.hostname === 'tile.openstreetmap.org') referer.push(peticion.headers().referer ?? '');
    });
    await abrirMapaComoInvitado(page);
    const mapa = page.locator('[data-mapa="osm"]');
    await expect(mapa).toBeVisible();
    await expect(lista(page).first()).toBeVisible();
    await expect.poll(() => referer.length, { timeout: 8000 }).toBeGreaterThan(0);
    // El servidor público exige un Referer válido: nuestras cabeceras lo envían
    expect(referer.every((r) => r.startsWith('http://localhost'))).toBe(true);

    const atribucion = mapa.locator('.leaflet-control-attribution');
    await expect(atribucion).toContainText('OpenStreetMap');
    await expect(atribucion.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    // Abajo a la derecha y nada encima
    const cajaMapa = (await mapa.boundingBox())!;
    const cajaAtr = (await atribucion.boundingBox())!;
    expect(cajaMapa.x + cajaMapa.width - (cajaAtr.x + cajaAtr.width)).toBeLessThanOrEqual(2);
    expect(cajaMapa.y + cajaMapa.height - (cajaAtr.y + cajaAtr.height)).toBeLessThanOrEqual(2);
    const libre = await page.evaluate(() => {
      const enlace = document.querySelector('.leaflet-control-attribution a[href*="openstreetmap"]')!;
      const caja = enlace.getBoundingClientRect();
      const arriba = document.elementFromPoint(caja.x + caja.width / 2, caja.y + caja.height / 2);
      return arriba === enlace;
    });
    expect(libre).toBe(true);
    expect([...hosts].filter((h) => h.includes('google') || h.includes('gstatic'))).toEqual([]);
  });

  test('con las teselas bloqueadas la lista funciona y el mapa avisa', async ({ page }) => {
    await page.route('https://tile.openstreetmap.org/**', (ruta) => ruta.abort('failed'));
    await abrirMapaComoInvitado(page);
    await expect(lista(page).first()).toBeVisible();
    await expect(page.getByText('No pudimos cargar el mapa. La lista muestra los mismos resultados.')).toBeVisible({
      timeout: 10_000,
    });
    await lista(page).first().click();
    await expect(page.getByRole('link', { name: 'Ver detalle' })).toBeVisible();
  });

  test('ninguna imagen del mapa se guarda para usar sin conexión', async ({ page }) => {
    await abrirMapaComoInvitado(page);
    await expect(page.locator('[data-mapa="osm"] .leaflet-tile-loaded').first()).toBeAttached({ timeout: 8000 });
    await esperarRed(page);
    const guardadas = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const nombre of await caches.keys()) {
        const cache = await caches.open(nombre);
        for (const peticion of await cache.keys()) urls.push(peticion.url);
      }
      return urls;
    });
    expect(guardadas.filter((url) => /tile\.|maptiler|openstreetmap|\.png(\?|$)/i.test(url))).toEqual([]);
  });

  test('cambiar de proveedor es solo configuración: MapTiler y Google', async ({ page, browser }) => {
    await page.route('https://api.maptiler.com/**', (ruta) => ruta.fulfill({ body: TESELA, contentType: 'image/png' }));
    await conProveedor(page, {
      proveedor: 'maptiler',
      teselas: {
        url: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=prueba',
        atribucion: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © OpenStreetMap',
        maxZoom: 21,
      },
    });
    await abrirMapaComoInvitado(page);
    await expect(page.locator('[data-mapa="maptiler"] .leaflet-control-attribution')).toContainText('MapTiler');

    const otra = await browser.newContext({
      geolocation: ORIGEN,
      permissions: ['geolocation'],
      viewport: page.viewportSize() ?? undefined,
    });
    const google = await otra.newPage();
    await simularGoogleMaps(google);
    const teselas: string[] = [];
    google.on('request', (peticion) => {
      if (peticion.url().includes('tile.openstreetmap.org')) teselas.push(peticion.url());
    });
    await conProveedor(google, {
      proveedor: 'google',
      teselas: null,
      google: { clave: 'clave-de-pruebas', idMapa: 'DEMO_MAP_ID' },
    });
    await abrirMapaComoInvitado(google);
    await expect(google.locator('[data-mapa-simulado]')).toBeVisible();
    expect(teselas).toEqual([]);
    await otra.close();
  });
});

// Un centro distinto por proyecto: otros flujos dejan un cambio de dirección pendiente en el 900000011
const centroDe = (proyecto: string) => (proyecto === 'movil-360' ? '900000012' : '900000013');

test.describe('búsqueda de direcciones para el pin', () => {
  test.beforeEach(async ({ page }) => {
    await simularGoogleMaps(page);
  });

  test('solo busca al tocar «Buscar», no mientras se escribe, y el pin se puede ajustar a mano', async ({
    page,
  }, info) => {
    const pedidos: string[] = [];
    await page.route('**/api/v1/direcciones/buscar**', async (ruta) => {
      pedidos.push(ruta.request().url());
      await ruta.fulfill({
        json: { resultados: [{ nombre: 'Jirón Moquegua 450, Juliaca, Puno, Perú', lat: -15.4927, lng: -70.1342 }] },
      });
    });
    await ingresar(page, centroDe(info.project.name), CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/negocio$/);
    await page.goto('/negocio/datos');
    await page.getByRole('button', { name: 'Solicitar cambio de dirección' }).click();
    const buscador = page.getByLabel('Buscar la dirección de tu local');
    await buscador.pressSequentially('Moquegua 450', { delay: 60 });
    await page.waitForTimeout(1200);
    expect(pedidos).toHaveLength(0);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('button', { name: /Jirón Moquegua 450/ }).click();
    expect(pedidos).toHaveLength(1);
    const lienzo = page.getByRole('application', { name: /colocar el pin de tu local/ });
    await expect(lienzo).toHaveAttribute('data-pin', '-15.4927,-70.1342');
    // Ajuste a mano con un toque en el mapa
    await lienzo.click({ position: { x: 60, y: 60 } });
    await expect(lienzo).not.toHaveAttribute('data-pin', '-15.4927,-70.1342');
    await expect(lienzo).toHaveAttribute('data-pin', /^-15\.\d+,-70\.\d+$/);
  });

  test('si el servicio de búsqueda falla, avisa y el mapa sigue sirviendo', async ({ page }, info) => {
    await page.route('**/api/v1/direcciones/buscar**', (ruta) =>
      ruta.fulfill({
        status: 503,
        json: {
          error: {
            codigo: 'BUSQUEDA_NO_DISPONIBLE',
            mensaje: 'No pudimos buscar la dirección ahora. Toca el mapa para colocar el pin.',
          },
        },
      }),
    );
    await ingresar(page, centroDe(info.project.name), CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/negocio$/);
    await page.goto('/negocio/datos');
    await page.getByRole('button', { name: 'Solicitar cambio de dirección' }).click();
    await page.getByLabel('Buscar la dirección de tu local').fill('Calle inventada 999');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByText('No pudimos buscar la dirección ahora.')).toBeVisible();
    const lienzo = page.getByRole('application', { name: /colocar el pin de tu local/ });
    await lienzo.click({ position: { x: 80, y: 80 } });
    await expect(lienzo).toHaveAttribute('data-pin', /^-15\./);
  });
});
