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

const RECICLADOR = '900000001';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

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

test.describe.serial('administración: parámetros, ciudades, premios y entregas (62, 63, 66)', () => {
  test('un parámetro fuera de rango se rechaza y uno válido queda con motivo y en «Últimos cambios»', async ({
    browser,
  }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/configuracion');
    await expect(admin.getByRole('heading', { name: /Configuración/ })).toBeVisible();
    const fila = admin.locator('[data-parametro="aviso_max_activos"]');
    await expect(fila).toBeVisible();
    const actual = await fila.getByRole('textbox').inputValue();
    await sinDesbordeHorizontal(admin);
    await fila.getByRole('textbox').fill('99');
    await fila.getByRole('button', { name: 'Cambiar' }).click();
    await expect(fila).toContainText('Debe estar entre 1 y 10');
    await fila.getByRole('textbox').fill(actual === '4' ? '5' : '4');
    await fila.getByRole('button', { name: 'Cambiar' }).click();
    const ventana = admin.getByRole('dialog');
    await ventana.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(ventana).toContainText('Escribe el motivo');
    await ventana.getByLabel('Motivo (se registra)').fill('Ajuste de la prueba de flujo');
    await ventana.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(admin.locator('[data-historial]')).toContainText('Ajuste de la prueba de flujo');
    // Los que afectan el costo de premios piden una confirmación más
    const costo = admin.locator('[data-parametro="puntos_por_giro"]');
    await costo.getByRole('textbox').fill('600');
    await costo.getByRole('button', { name: 'Cambiar' }).click();
    await admin.getByRole('dialog').getByLabel('Motivo (se registra)').fill('Prueba de costo');
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(admin.getByRole('dialog')).toContainText('costo de los premios');
    await admin.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await admin.context().close();
  });

  test('las ciudades se agregan como «Próximamente» y no se activan sin sus requisitos', async ({ browser }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/ciudades');
    await expect(admin.locator('[data-ciudad="Juliaca"]')).toContainText('Activa');
    await sinDesbordeHorizontal(admin);
    await admin.getByRole('button', { name: 'Agregar ciudad' }).click();
    const nombre = `Ciudad de flujo ${info.project.name === 'movil-360' ? 'm' : 'e'}`;
    await admin.getByRole('dialog').getByLabel('Nombre', { exact: true }).fill(nombre);
    await admin.getByRole('dialog').getByLabel('Región').fill('Región de flujo');
    await admin.getByRole('dialog').getByLabel('Motivo (se registra)').fill('Nueva ciudad de prueba');
    await admin.getByRole('dialog').getByRole('button', { name: 'Agregar' }).click();
    const tarjeta = admin.locator(`[data-ciudad="${nombre}"]`);
    await expect(tarjeta).toContainText('Próximamente');
    await expect(tarjeta.getByRole('button', { name: 'Activar ciudad' })).toBeDisabled();
    await expect(tarjeta).toContainText('Verificadores asignados');
    await expect(tarjeta.locator('[data-espera]')).toHaveText('0');
    await sinDesbordeHorizontal(admin);
    await admin.context().close();
  });

  test('las probabilidades deben sumar 100 % para guardar; la pausa avisa en la ruleta y se reanuda', async ({
    browser,
    page,
  }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/premios');
    await expect(admin.locator('[data-suma]')).toContainText('100 %');
    await sinDesbordeHorizontal(admin);
    const guardar = admin.getByRole('button', { name: 'Guardar catálogo' });
    await expect(guardar).toBeEnabled();
    const primera = admin.locator('[data-seccion="premios"] [data-premio]').first();
    const campo = primera.getByLabel('Probabilidad');
    const original = await campo.inputValue();
    await campo.fill(String(Number(original) + 5));
    await expect(admin.locator('[data-suma]')).toContainText('Debe sumar exactamente 100 %');
    await expect(guardar).toBeDisabled();
    await campo.fill(original);
    await expect(guardar).toBeEnabled();

    await admin.getByRole('button', { name: 'Pausar ruleta' }).click();
    await admin.getByRole('dialog').getByLabel('Motivo (se registra)').fill('Revisión de premios');
    await admin.getByRole('dialog').getByRole('button', { name: 'Pausar' }).click();
    await expect(admin.getByRole('button', { name: 'Reanudar ruleta' })).toBeVisible();

    await ingresar(page, RECICLADOR, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa/);
    await esperarRed(page);
    await page.goto('/puntos/ruleta');
    await expect(page.getByText('Ruleta en pausa')).toBeVisible();
    await expect(page.getByText('Conservas tus giros')).toBeVisible();
    await sinDesbordeHorizontal(page);

    await admin.getByRole('button', { name: 'Reanudar ruleta' }).click();
    await admin.getByRole('dialog').getByLabel('Motivo (se registra)').fill('Revisión terminada');
    await admin.getByRole('dialog').getByRole('button', { name: 'Reanudar' }).click();
    await expect(admin.getByRole('button', { name: 'Pausar ruleta' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Ruleta en pausa')).toHaveCount(0);
    await admin.context().close();
  });

  test('las entregas se ven por estado y el código inválido se rechaza', async ({ browser }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/premios');
    await admin.getByRole('group', { name: 'Sección' }).getByRole('button', { name: 'Entregas' }).click();
    await expect(admin.locator('[data-seccion="entregas"]')).toBeVisible();
    for (const filtro of ['Por vencer', 'Entregados', 'Vencidos', 'Por entregar']) {
      await admin
        .getByRole('group', { name: 'Estado de la entrega' })
        .getByRole('button', { name: new RegExp(filtro) })
        .click();
    }
    await admin.getByLabel('Código del premio').fill('ABC');
    await admin.getByRole('button', { name: 'Marcar entregado' }).first().click();
    await expect(admin.locator('[data-seccion="entregas"]')).toContainText('RM-XXXX');
    await sinDesbordeHorizontal(admin);
    await admin.context().close();
  });

  test('el panel de inicio muestra los bloques de ruleta, ciudades y parámetros recientes', async ({
    browser,
  }, info) => {
    const admin = await entrarAdmin(browser, info);
    await expect(admin.locator('[data-panel="ruleta"]')).toContainText('Premios por entregar');
    await expect(admin.locator('[data-panel="ciudades"]')).toContainText('Juliaca');
    await expect(admin.locator('[data-panel="parametros"]')).toContainText('Parámetros recientes');
    await sinDesbordeHorizontal(admin);
    await admin.context().close();
  });
});
