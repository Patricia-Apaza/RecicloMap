import { expect, type Page, test } from '@playwright/test';
import { CLAVE_SEMILLA, ingresar, simularGoogleMaps, sinDesbordeHorizontal } from './apoyo';

// Plaza de Armas de Juliaca: el mismo origen que usa la semilla
const ORIGEN = { latitude: -15.493, longitude: -70.129 };

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

async function entrarComoInvitado(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar como invitado' }).first().click();
  await expect(page).toHaveURL(/\/mapa$/);
}

const lista = (page: Page) =>
  page.getByRole('region', { name: 'Filtros y resultados' }).getByRole('button', { name: /por kilo/ });
const mapa = (page: Page) => page.locator('[data-mapa-simulado]');

test.describe('mapa con la ubicación del dispositivo', () => {
  test.use({ geolocation: ORIGEN, permissions: ['geolocation'] });

  test('el invitado ve el mapa; cambiar el radio actualiza la lista y el mapa a la vez', async ({ page }) => {
    await entrarComoInvitado(page);
    await expect(
      page.getByText('Usamos tu ubicación solo para calcular distancias; nunca se muestra a nadie.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await expect(page.getByText('Desde tu ubicación aproximada')).toBeVisible();

    // La ubicación viaja redondeada en una cabecera, nunca en la dirección de la petición
    const [peticion] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/v1/compradores?')),
      page.getByRole('group', { name: 'Radio' }).getByRole('button', { name: '20 km' }).click(),
    ]);
    expect(peticion.url()).not.toMatch(/-15\.|-70\./);
    expect(peticion.headers()['x-posicion']).toMatch(/^-15\.\d{1,3},-70\.\d{1,3}$/);

    await expect(page.getByText(/en 20 km para/)).toBeVisible();
    await expect(mapa(page).locator('[data-radio-metros="20000"]')).toHaveCount(1);
    const amplio = await lista(page).count();
    expect(amplio).toBeGreaterThan(0);
    await expect(mapa(page).locator('[data-marcador]:not([data-marcador="punto"])')).toHaveCount(amplio);
    await expect(page.getByText('sabe que vas en camino')).toHaveCount(0);

    await page.getByRole('group', { name: 'Radio' }).getByRole('button', { name: '1 km' }).click();
    await expect(mapa(page).locator('[data-radio-metros="1000"]')).toHaveCount(1);
    await expect(page.getByText(/en 1 km para/)).toBeVisible();
    const cercano = await lista(page).count();
    expect(cercano).toBeLessThan(amplio);
    await expect(mapa(page).locator('[data-marcador]:not([data-marcador="punto"])')).toHaveCount(cercano);

    // Cada opción lleva el semáforo con texto y la demanda aparte
    await page.getByRole('group', { name: 'Radio' }).getByRole('button', { name: '10 km' }).click();
    const primera = lista(page).first();
    await expect(primera.locator('[data-semaforo]')).toHaveText(
      /Mejor precio|Precio intermedio|Precio bajo|Sin comparación/,
    );
    await expect(primera.locator('[data-demanda]')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('el semáforo del detalle coincide con el de la lista', async ({ page }) => {
    await entrarComoInvitado(page);
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await page.getByRole('group', { name: 'Radio' }).getByRole('button', { name: '10 km' }).click();
    const item = lista(page).filter({ hasText: 'Acopio Titicaca' });
    const enLista = await item.locator('[data-semaforo]').getAttribute('data-semaforo');
    await item.click();
    await page.getByRole('link', { name: 'Ver detalle' }).click();

    await expect(page).toHaveURL(/\/negocios\/[0-9a-f-]+/);
    await expect(page.getByRole('heading', { level: 1, name: /Acopio Titicaca/ })).toBeVisible();
    await expect(page.getByText(/de ti$/)).toBeVisible();
    await expect(page.locator(`[data-material="pet"] [data-semaforo="${enLista}"]`)).toBeVisible();
    // Fase 8: el invitado puede pedir cómo llegar y comparar; guardar y reportar exigen cuenta
    await expect(page.getByRole('link', { name: 'Cómo llegar' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Comparar con otros compradores/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Reportar información/ })).toHaveCount(0);
    await sinDesbordeHorizontal(page);
  });
});

test('sin permiso de ubicación se elige la zona y todo sigue funcionando', async ({ page }) => {
  await entrarComoInvitado(page);
  await page.getByLabel('O elige tu zona').selectOption({ label: 'Centro de Juliaca' });
  await expect(page.getByText('Desde Centro de Juliaca')).toBeVisible();
  await expect(lista(page).first()).toBeVisible();
  await page.getByRole('link', { name: 'Ver en lista' }).click();
  await expect(page).toHaveURL(/\/mapa\/lista$/);
  await expect(page.getByRole('heading', { name: /Quién compra/ })).toBeVisible();
  await expect(page.getByText('Desde Centro de Juliaca')).toBeVisible();
  await sinDesbordeHorizontal(page);
});

test('el detalle de un comprador móvil muestra "No indicado" en lo que no declaró', async ({ page }) => {
  await entrarComoInvitado(page);
  await page.getByLabel('O elige tu zona').selectOption({ label: 'Centro de Juliaca' });
  await page.getByRole('group', { name: 'Radio' }).getByRole('button', { name: '20 km' }).click();
  await lista(page).filter({ hasText: 'Compras Rubén' }).click();
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Compras Rubén/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zona de trabajo' })).toBeVisible();
  const pagos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Métodos de pago' }) });
  await expect(pagos.getByText('No indicado')).toBeVisible();
});

test('el reciclador guarda una búsqueda desde los filtros', async ({ page }) => {
  await ingresar(page, '900000001', CLAVE_SEMILLA);
  await expect(page).toHaveURL(/\/mapa$/);
  await page.goto('/mapa/filtros');
  await expect(page.getByRole('heading', { name: /Busca con los/ })).toBeVisible();
  await page.getByLabel('O elige tu zona').selectOption({ label: 'Barrio Santa Rosa' });
  await page.getByRole('group', { name: 'Material' }).getByRole('button', { name: 'Cartón' }).click();
  await page.getByRole('button', { name: 'Guardar esta búsqueda' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Búsqueda guardada|ya tienes 5/i })).toBeVisible();
  await expect(page.getByText(/Cartón · todos · \d+ km/).first()).toBeVisible();
  await sinDesbordeHorizontal(page);
});
