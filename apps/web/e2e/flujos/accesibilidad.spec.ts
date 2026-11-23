import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import {
  ADMIN,
  CLAVE_SEMILLA,
  codigoDe,
  escribirCodigo,
  ingresar,
  simularGoogleMaps,
  sinDesbordeHorizontal,
  esperarRed,
} from './apoyo';

const MARCO = '900000001';
const ORIGEN = { latitude: -15.493, longitude: -70.129 };

test.use({ geolocation: ORIGEN, permissions: ['geolocation'] });
const TITICACA = '900000011';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
  // Las animaciones de entrada de la portada dejan el texto a medio aparecer: se mide con el movimiento reducido
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// Verificador automático WCAG 2.1 AA: no debe haber fallos graves ni críticos; el resto se informa
async function revisar(page: Page, nombre: string, info: TestInfo) {
  await esperarRed(page);
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const resto = resultado.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
  await info.attach(`axe-${nombre}.json`, {
    body: JSON.stringify(
      {
        graves: graves.map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.map((n) => n.target) })),
        menores: resto.map((v) => v.id),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(
    graves.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
    `Fallos de accesibilidad en ${nombre}`,
  ).toEqual([]);
  await sinDesbordeHorizontal(page);
}

async function entrarAdmin(browser: Browser, info: TestInfo): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport });
  const page = await contexto.newPage();
  await simularGoogleMaps(page);
  await page.goto('/ingresar');
  await page.getByLabel('Correo o teléfono').fill(ADMIN);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE_SEMILLA);
  const codigo = await codigoDe(page, '/auth/login', () => page.getByRole('button', { name: 'Ingresar' }).click());
  await escribirCodigo(page, codigo);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

test.describe('accesibilidad AA en las pantallas clave (verificador automático)', () => {
  test('pantallas públicas: bienvenida, ingreso, registro, términos y ayuda', async ({ page }, info) => {
    for (const [ruta, nombre] of [
      ['/', 'bienvenida'],
      ['/ingresar', 'ingreso'],
      ['/registro/reciclador', 'registro'],
      ['/terminos', 'terminos'],
      ['/ayuda', 'ayuda'],
    ] as const) {
      await page.goto(ruta);
      await revisar(page, nombre, info);
    }
  });

  test('reciclador: mapa, lista, publicar, historial, ruleta y configuración', async ({ page }, info) => {
    await ingresar(page, MARCO, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa$/);
    for (const [ruta, nombre] of [
      ['/mapa', 'mapa'],
      ['/mapa/lista', 'lista'],
      ['/publicar', 'publicar'],
      ['/historial', 'historial'],
      ['/puntos/ruleta', 'ruleta'],
      ['/configuracion', 'configuracion'],
    ] as const) {
      await page.goto(ruta);
      if (ruta === '/mapa/lista' || ruta === '/mapa') {
        const ubicacion = page.getByRole('button', { name: 'Usar mi ubicación' });
        if (await ubicacion.isVisible().catch(() => false)) await ubicacion.click();
        await esperarRed(page);
      }
      await revisar(page, nombre, info);
    }
  });

  test('ficha del negocio', async ({ page }, info) => {
    await ingresar(page, MARCO, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/mapa/lista');
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await page.getByRole('link', { name: 'Ver detalle' }).first().click();
    await expect(page).toHaveURL(/\/negocios\//);
    await revisar(page, 'ficha', info);
  });

  test('negocio: panel y precios', async ({ page }, info) => {
    await ingresar(page, TITICACA, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/negocio$/);
    await revisar(page, 'panel-negocio', info);
    await page.goto('/negocio/precios');
    await revisar(page, 'precios', info);
  });

  test('administración: panel y configuración', async ({ browser }, info) => {
    const admin = await entrarAdmin(browser, info);
    await revisar(admin, 'panel-admin', info);
    await admin.goto('/admin/configuracion');
    await expect(admin.locator('[data-control="mantenimiento"]')).toBeVisible();
    await revisar(admin, 'configuracion-admin', info);
    await admin.context().close();
  });
});

test.describe('revisión de accesibilidad que el verificador no cubre', () => {
  test('la ruleta no se anima con «reducir movimiento»', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ingresar(page, MARCO, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/puntos/ruleta');
    const rueda = page.locator('[aria-label="Ruleta de premios"]');
    await expect(rueda).toBeVisible();
    const transicion = await rueda.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transicion.split(',').every((t) => parseFloat(t) === 0)).toBe(true);
  });

  test('con el teclado se llega a los controles y el foco se ve', async ({ page }) => {
    await page.goto('/ingresar');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await page.keyboard.press('Tab');
    const primero = page.locator(':focus');
    await expect(primero).toBeVisible();
    const contorno = await primero.evaluate((el) => {
      const e = getComputedStyle(el);
      return { estilo: e.outlineStyle, ancho: parseFloat(e.outlineWidth), sombra: e.boxShadow };
    });
    expect(contorno.estilo !== 'none' && contorno.ancho >= 2 ? true : contorno.sombra !== 'none').toBe(true);
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('los controles táctiles miden al menos 44 px en el celular', async ({ page }, info) => {
    test.skip(info.project.name !== 'movil-360', 'Solo aplica al celular');
    await page.goto('/ingresar');
    const pequenos = await page.evaluate(() => {
      const mal: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]), select, [role=button]'),
      )) {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        // Un enlace dentro de un párrafo no cuenta (WCAG 2.5.8): se mide cada control propio
        const enTexto = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
        if (visible && !enTexto && (r.height < 44 || r.width < 44))
          mal.push(
            `${el.tagName.toLowerCase()} «${(el.textContent ?? '').trim().slice(0, 30)}» ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
      }
      return mal;
    });
    expect(pequenos).toEqual([]);
  });

  test('el texto ampliado al 200 % no desborda ni oculta lo importante', async ({ page }) => {
    await page.goto('/ingresar');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('los errores de un formulario se anuncian y no dependen solo del color', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const error = page.locator('.field.err .msg').first();
    await expect(error).toBeVisible();
    await expect(error).toContainText(/\S/);
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  });
});
