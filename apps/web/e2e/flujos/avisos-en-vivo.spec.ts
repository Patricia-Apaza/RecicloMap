import { expect, test } from '@playwright/test';
import { CLAVE_SEMILLA, ingresar, simularGoogleMaps, esperarRed } from './apoyo';

// Los avisos en vivo usan sondeo largo por el mismo origen: cada sondeo es una solicitud que un túnel cuenta
test('los avisos en vivo llegan por el sondeo largo y cuestan pocas solicitudes, también con la pestaña oculta', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'movil-360', 'Se mide una vez: es el mismo comportamiento');
  test.setTimeout(240_000);
  await simularGoogleMaps(page);
  const sondeos: number[] = [];
  page.on('request', (peticion) => {
    if (peticion.url().includes('/api/v1/en-vivo')) sondeos.push(Date.now());
  });
  await ingresar(page, '900000001', CLAVE_SEMILLA);
  await expect(page).toHaveURL(/\/mapa$/);
  await esperarRed(page);

  // Navegar por la app no abre otra conexión
  await page.goto('/puntos');
  await page.waitForTimeout(4000);
  const antesDeNavegar = sondeos.length;
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Historial' }).click();
  await expect(page).toHaveURL(/\/historial$/);
  await page.waitForTimeout(2000);
  expect(sondeos.length - antesDeNavegar).toBeLessThanOrEqual(1);

  // Pestaña visible: cada 55 s un ciclo de 3 solicitudes (sondeo, respuesta y siguiente), no cada 25 s
  const inicio = sondeos.length;
  await page.waitForTimeout(95_000);
  const visibles = sondeos.length - inicio;
  expect(visibles).toBeLessThanOrEqual(8);
  expect(visibles).toBeGreaterThanOrEqual(2);

  // Pestaña oculta: la conexión se cierra y no hay solicitudes; al volver se reabre
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  const alOcultar = sondeos.length;
  await page.waitForTimeout(50_000);
  expect(sondeos.length - alOcultar).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => sondeos.length - alOcultar, { timeout: 8000 }).toBeGreaterThan(0);
});
