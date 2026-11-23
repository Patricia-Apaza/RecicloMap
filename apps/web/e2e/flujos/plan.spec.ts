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

const ECO = '900000012';
const NOMBRE = 'EcoAcopio Juliaca';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

async function entrarNegocio(page: Page): Promise<void> {
  await ingresar(page, ECO, CLAVE_SEMILLA);
  await expect(page).toHaveURL(/\/negocio$/);
  await esperarRed(page);
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
  await esperarRed(page);
  return page;
}

test.describe.serial('plan Pro: solicitud, activación del administrador y efectos (46)', () => {
  test('el negocio Gratis pide Pro con un mensaje; ve su estado y puede cancelar', async ({ page }) => {
    await entrarNegocio(page);
    await page.goto('/negocio/plan');
    const plan = page.locator('[data-panel="plan"]');
    // Si un ciclo anterior dejó algo pendiente, se cancela para empezar limpio
    if (await plan.locator('[data-cancelar-solicitud]').count()) {
      await plan.locator('[data-cancelar-solicitud]').click();
      await expect(plan.locator('[data-solicitar-pro]')).toBeVisible();
    }
    await expect(plan).toHaveAttribute('data-estado-plan', 'GRATIS');
    await expect(plan).toContainText('Plan Gratis');
    await expect(plan).not.toContainText(/S\/\s?\d/);
    await expect(plan.locator('[data-beneficios]')).toContainText('90 días');
    await sinDesbordeHorizontal(page);

    await plan.locator('[data-solicitar-pro]').click();
    const dialogo = page.getByRole('dialog', { name: 'Solicitar el plan Pro' });
    await sinDesbordeHorizontal(page);
    await dialogo.getByLabel('Mensaje').fill('Quiero ver las estadísticas de 90 días.');
    await dialogo.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(plan).toHaveAttribute('data-estado-plan', 'SOLICITADO');
    await expect(plan.locator('[data-solicitud]')).toContainText('Solicitud en revisión');
    await expect(plan.locator('[data-solicitud]')).toContainText('Quiero ver las estadísticas');
    await expect(plan.locator('[data-solicitar-pro]')).toHaveCount(0);

    // Cancelar y volver a pedir
    await plan.locator('[data-cancelar-solicitud]').click();
    await expect(plan).toHaveAttribute('data-estado-plan', 'GRATIS');
    await plan.locator('[data-solicitar-pro]').click();
    const segunda = page.getByRole('dialog', { name: 'Solicitar el plan Pro' });
    await segunda.getByLabel('Mensaje').fill('Quiero ver las estadísticas de 90 días.');
    await segunda.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(plan).toHaveAttribute('data-estado-plan', 'SOLICITADO');
  });

  test('el bloque Pro de las estadísticas lleva al botón "Solicitar plan Pro"', async ({ page }) => {
    await entrarNegocio(page);
    await page.goto('/negocio/estadisticas');
    await page.getByRole('button', { name: /^90 días/ }).click();
    const bloque = page.locator('[data-bloque-pro]').first();
    await expect(bloque).toContainText('Disponible con plan Pro');
    await sinDesbordeHorizontal(page);
    await bloque.locator('[data-solicitar-pro]').click();
    await expect(page).toHaveURL(/\/negocio\/plan$/);
  });

  test('la administración ve la solicitud y la aprueba con fechas y motivo', async ({ browser }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/plan');
    await expect(admin.getByRole('heading', { name: /Plan/ }).first()).toBeVisible();
    const tarjeta = admin.locator('[data-solicitud="PENDIENTE"]').filter({ hasText: NOMBRE });
    await expect(tarjeta).toContainText('Quiero ver las estadísticas de 90 días.');
    await sinDesbordeHorizontal(admin);
    await tarjeta.getByRole('button', { name: 'Aprobar' }).click();
    const dialogo = admin.getByRole('dialog', { name: `Aprobar y activar Pro · ${NOMBRE}` });
    await dialogo.getByRole('button', { name: 'Aprobar y activar Pro' }).click();
    await expect(dialogo.getByText(/motivo/i).first()).toBeVisible();
    await sinDesbordeHorizontal(admin);
    await dialogo.getByLabel('Motivo').fill('Negocio verificado con buen historial');
    await dialogo.getByRole('button', { name: 'Aprobar y activar Pro' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Plan Pro activado' })).toBeVisible();
    await expect(admin.locator('[data-negocio]').filter({ hasText: NOMBRE })).toContainText('Pro');
    await admin.context().close();
  });

  test('con Pro vigente el negocio ve su fecha y recibe las estadísticas de 90 días', async ({ page }) => {
    await entrarNegocio(page);
    await page.goto('/negocio/plan');
    const plan = page.locator('[data-panel="plan"]');
    await expect(plan).toHaveAttribute('data-estado-plan', 'PRO');
    await expect(plan.locator('[data-vigencia]')).toContainText('Pro hasta el');
    await sinDesbordeHorizontal(page);
    await page.goto('/negocio/estadisticas');
    await page.getByRole('button', { name: /^90 días/ }).click();
    await expect(page.locator('[data-bloque-pro]')).toHaveCount(0);
    await page.goto('/notificaciones');
    await expect(page.getByText('Tu plan Pro está activo').first()).toBeVisible();
  });

  test('la administración desactiva Pro con motivo y el negocio vuelve a Gratis sin perder nada', async ({
    browser,
    page,
  }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/plan');
    const fila = admin.locator('[data-negocio]').filter({ hasText: NOMBRE });
    await fila.getByRole('button', { name: 'Desactivar' }).click();
    const dialogo = admin.getByRole('dialog', { name: `Desactivar plan Pro · ${NOMBRE}` });
    await dialogo.getByLabel('Motivo').fill('Pedido del negocio');
    await dialogo.getByRole('button', { name: 'Desactivar plan Pro' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Plan desactivado' })).toBeVisible();
    await admin.context().close();

    await entrarNegocio(page);
    await page.goto('/negocio/plan');
    await expect(page.locator('[data-panel="plan"]')).toHaveAttribute('data-estado-plan', 'GRATIS');
    await page.locator('[data-historial-plan] summary').click();
    await expect(page.locator('[data-historial-plan]')).toContainText('Plan Pro desactivado');
    await page.goto('/negocio/estadisticas');
    await page.getByRole('button', { name: /^90 días/ }).click();
    await expect(page.locator('[data-bloque-pro]').first()).toBeVisible();
  });
});
