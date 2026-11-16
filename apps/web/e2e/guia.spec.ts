import { expect, type Page, test } from '@playwright/test';

const esMovil = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

async function sinDesplazamientoHorizontal(page: Page) {
  const anchos = await page.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    vista: window.innerWidth,
  }));
  expect(anchos.documento).toBeLessThanOrEqual(anchos.vista);
}

test.describe('Página de muestra del sistema de diseño', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interno/guia');
  });

  test('no se desplaza a lo ancho', async ({ page }) => {
    await sinDesplazamientoHorizontal(page);
    for (const rol of ['Invitado', 'Centro', 'Comprador móvil', 'Administración']) {
      await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: rol }).click();
      await sinDesplazamientoHorizontal(page);
    }
  });

  test('el semáforo y la demanda se leen con texto', async ({ page }) => {
    const reglas = page.locator('#reglas');
    for (const texto of [
      'Mejor precio',
      'Precio intermedio',
      'Precio bajo',
      'Demanda alta',
      'Demanda media',
      'Demanda baja',
    ]) {
      await expect(reglas.getByText(texto, { exact: true })).toBeVisible();
    }
  });

  test('los formatos de Perú se ven aplicados', async ({ page }) => {
    const formatos = page.locator('#formatos');
    await expect(formatos.getByText('S/ 1,234.50')).toBeVisible();
    await expect(formatos.getByText('S/ 2.50–2.80')).toBeVisible();
    await expect(formatos.getByText('1,240.5 kg')).toBeVisible();
    await expect(formatos.getByText('12 oct 2026 · 09:12')).toBeVisible();
  });

  test('los botones principales se pueden tocar con el dedo', async ({ page }) => {
    const botones = page.locator('#botones .btn:not(.sm)');
    for (const boton of await botones.all()) {
      const caja = await boton.boundingBox();
      expect(caja?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('la barra muestra pestañas en escritorio y hamburguesa en móvil', async ({ page }) => {
    const muestra = page.locator('header.nav');
    const hamburguesa = muestra.getByRole('button', { name: 'Menú' });
    const pestanas = muestra.getByRole('navigation', { name: 'Principal' });
    if (esMovil(page)) {
      await expect(pestanas).toBeHidden();
      await hamburguesa.click();
      await expect(muestra.locator('#menu-movil').getByRole('link', { name: 'Calculadora' })).toBeVisible();
      await hamburguesa.click();
      await expect(muestra.locator('#menu-movil')).toBeHidden();
    } else {
      await expect(hamburguesa).toBeHidden();
      await expect(pestanas.getByRole('link', { name: 'Calculadora' })).toBeVisible();
      await pestanas.getByText('Más').click();
      await expect(pestanas.getByRole('link', { name: 'Ranking' })).toBeVisible();
    }
  });

  test('el invitado ve la franja para crear su cuenta', async ({ page }) => {
    await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: 'Invitado' }).click();
    await expect(page.getByText('Estás viendo como invitado.')).toBeVisible();
    await sinDesplazamientoHorizontal(page);
  });

  test('el centro tiene campana de notificaciones', async ({ page }) => {
    await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: 'Centro' }).click();
    await expect(page.locator('header.nav .acts a[href="/notificaciones"]')).toBeVisible();
  });

  test('la ventana se cierra con Esc', async ({ page }) => {
    await page.getByRole('button', { name: 'Abrir ejemplo' }).click();
    await expect(page.getByRole('dialog', { name: '¿Aceptar esta oferta?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

test.describe('Barra de navegación en anchos de escritorio', () => {
  for (const ancho of [1024, 1179, 1180, 1320, 1440]) {
    test(`a ${ancho} px las pestañas y los accesos no se superponen`, async ({ page }) => {
      test.skip(esMovil(page), 'solo escritorio');
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.goto('/interno/guia');
      for (const rol of ['Reciclador', 'Invitado', 'Centro', 'Comprador móvil', 'Administración']) {
        await page.getByRole('group', { name: 'Rol' }).getByRole('button', { name: rol }).click();
        // Reciclador e invitado usan la hamburguesa hasta 1179 px
        if (!(await page.locator('header.nav .tabs').isVisible())) {
          await expect(page.locator('header.nav').getByRole('button', { name: 'Menú' })).toBeVisible();
          continue;
        }
        const pestanas = await page.locator('header.nav .tabs').boundingBox();
        const accesos = await page.locator('header.nav .acts').boundingBox();
        const marca = await page.locator('header.nav .brand').boundingBox();
        expect(pestanas && accesos && marca).toBeTruthy();
        const finPestanas = await page
          .locator('header.nav .tabs > *')
          .evaluateAll((hijos) => Math.max(...hijos.map((hijo) => hijo.getBoundingClientRect().right)));
        const inicioPestanas = await page
          .locator('header.nav .tabs > *')
          .evaluateAll((hijos) => Math.min(...hijos.map((hijo) => hijo.getBoundingClientRect().left)));
        expect(finPestanas, `${rol}: pestañas sobre accesos`).toBeLessThanOrEqual(accesos!.x + 1);
        expect(inicioPestanas, `${rol}: pestañas sobre la marca`).toBeGreaterThanOrEqual(marca!.x + marca!.width - 1);
      }
    });
  }
});

test.describe('Aplicación instalable', () => {
  test('publica un manifiesto con nombre, colores e íconos', async ({ request }) => {
    const manifiesto = await (await request.get('/manifest.webmanifest')).json();
    expect(manifiesto).toMatchObject({
      name: 'RecicloMap',
      display: 'standalone',
      lang: 'es-PE',
      theme_color: '#F6F1E4',
      background_color: '#F6F1E4',
    });
    for (const icono of manifiesto.icons as Array<{ src: string; sizes: string }>) {
      const respuesta = await request.get(icono.src);
      expect(respuesta.status()).toBe(200);
      expect(respuesta.headers()['content-type']).toContain('image/png');
    }
  });

  test('ofrece una página para cuando no hay conexión', async ({ page }) => {
    await page.goto('/sin-conexion');
    await expect(page.getByText('Sin conexión')).toBeVisible();
    const sw = await page.request.get('/sw.js');
    expect(sw.status()).toBe(200);
  });

  test('una ruta inexistente muestra la página de no encontrada en español', async ({ page }) => {
    const respuesta = await page.goto('/ruta-que-no-existe');
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByText('No encontramos esta página')).toBeVisible();
  });
});
