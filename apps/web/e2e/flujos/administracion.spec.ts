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

const CAMION = '900000022';
const CAMION_NOMBRE = 'Camión Los Andes';
const ECO = '900000012';

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

test.describe.serial('administración: panel, usuarios, avisos y auditoría (57, 59, 64)', () => {
  test('el panel de inicio muestra lo pendiente y métricas reales por período', async ({ browser }, info) => {
    const admin = await entrarAdmin(browser, info);
    await expect(admin.getByRole('heading', { name: /Panel/ })).toBeVisible();
    await expect(admin.locator('[data-kpis]')).toContainText('Usuarios');
    await expect(admin.locator('[data-kpis]')).toContainText('Negocios verificados');
    await expect(admin.locator('[data-panel="pendientes"]')).toContainText('Para revisar hoy');
    await expect(admin.locator('[data-pendiente="plan"]')).toBeVisible();
    await expect(admin.locator('[data-pendiente="cambios"]')).toBeVisible();
    await expect(admin.locator('[data-panel="operaciones"]')).toContainText('Tasa de cierre');
    await expect(admin.locator('[data-panel="usuarios-nuevos"] svg')).toBeVisible();
    await sinDesbordeHorizontal(admin);
    await admin.getByRole('group', { name: 'Período' }).getByRole('button', { name: '90 días' }).click();
    await expect(
      admin.getByRole('group', { name: 'Período' }).getByRole('button', { name: '90 días' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(admin.locator('[data-panel="kilos"]')).toBeVisible();
    await sinDesbordeHorizontal(admin);
    await admin.context().close();
  });

  test('suspender exige motivo y confirmación; la persona recibe el aviso y se reactiva con motivo', async ({
    browser,
    page,
  }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/usuarios');
    await expect(admin.locator('[data-kpis]')).toContainText('Suspendidos');
    await admin.getByLabel('Buscar').fill('Camión Los Andes');
    const fila = admin.locator('[data-usuario]').filter({ hasText: CAMION_NOMBRE });
    await expect(fila).toBeVisible();
    await sinDesbordeHorizontal(admin);
    await fila.getByRole('button', { name: CAMION_NOMBRE }).click();
    const ficha = admin.locator('[data-panel="ficha"]');
    await expect(ficha).toContainText('Actividad resumida');
    await expect(ficha).not.toContainText(/ubicación|contraseña/i);
    await expect(ficha).toContainText('No puedes editar datos de una cuenta');

    await ficha.locator('[data-suspender]').click();
    const dialogo = admin.getByRole('dialog', { name: CAMION_NOMBRE });
    await expect(dialogo.locator('[data-efectos]')).toContainText('no se cortan');
    await sinDesbordeHorizontal(admin);
    await dialogo.getByRole('button', { name: 'Confirmar suspensión' }).click();
    await expect(dialogo.getByText('Elige un motivo.')).toBeVisible();
    await dialogo.getByLabel(/Motivo/).selectOption('Incumplimiento de acuerdos');
    await dialogo.getByLabel('Nota para el registro').fill('Dos recicladores reportaron que no llegó');
    await dialogo.getByRole('button', { name: 'Confirmar suspensión' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'fue suspendido' })).toBeVisible();
    await expect(admin.locator('[data-panel="ficha"] [data-suspension]')).toContainText('Incumplimiento de acuerdos');

    // La persona lo ve en su bandeja y no puede pedir el plan Pro
    await ingresar(page, CAMION, CLAVE_SEMILLA);
    await expect(page).not.toHaveURL(/\/ingresar/);
    await esperarRed(page);
    await page.goto('/notificaciones');
    await expect(page.getByText('Tu cuenta fue suspendida').first()).toBeVisible();
    await expect(page.getByText(/Motivo: Incumplimiento de acuerdos/).first()).toBeVisible();

    // Se reactiva con motivo
    await admin.locator('[data-panel="ficha"] [data-reactivar]').click();
    const reactivar = admin.getByRole('dialog', { name: CAMION_NOMBRE });
    await reactivar.getByRole('button', { name: 'Confirmar reactivación' }).click();
    await expect(reactivar.getByText(/motivo/i).first()).toBeVisible();
    await reactivar.getByLabel('Motivo de la reactivación').fill('Aclaró lo ocurrido');
    await reactivar.getByRole('button', { name: 'Confirmar reactivación' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'fue reactivado' })).toBeVisible();
    await expect(admin.locator('[data-panel="ficha"]')).toContainText('Cambios de situación');
    await admin.context().close();
  });

  test('un aviso se oculta con motivo, el negocio lo lee y se restituye', async ({ browser, page }, info) => {
    await ingresar(page, ECO, CLAVE_SEMILLA);
    await expect(page).not.toHaveURL(/\/ingresar/);
    await esperarRed(page);
    await page.goto('/negocio/plan');
    const titulo = 'Horario para moderar';
    if (!(await page.locator('[data-aviso]').filter({ hasText: titulo }).count())) {
      await page.getByLabel('Título').fill(titulo);
      await page.getByLabel(/Mensaje/).fill('Atendemos toda la mañana.');
      await page.getByRole('button', { name: 'Publicar aviso' }).click();
    }
    await expect(page.locator('[data-aviso]').filter({ hasText: titulo })).toBeVisible();

    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/avisos');
    await admin.getByLabel('Buscar aviso').fill(titulo);
    const tarjeta = admin.locator('[data-aviso]').filter({ hasText: titulo }).first();
    await expect(tarjeta).toContainText('EcoAcopio Juliaca');
    await sinDesbordeHorizontal(admin);
    await tarjeta.getByRole('button', { name: 'Ocultar' }).click();
    const dialogo = admin.getByRole('dialog');
    await dialogo.getByRole('button', { name: 'Confirmar y ocultar' }).click();
    await expect(dialogo.getByText(/motivo/i).first()).toBeVisible();
    await dialogo.getByLabel(/Motivo/).fill('Incluye algo que no corresponde');
    await dialogo.getByRole('button', { name: 'Confirmar y ocultar' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Aviso oculto' })).toBeVisible();

    await page.goto('/negocio/plan');
    await expect(page.locator('[data-aviso-oculto]')).toContainText('Incluye algo que no corresponde');

    await admin.getByRole('group', { name: 'Estado' }).getByRole('button', { name: 'Ocultos' }).click();
    const oculto = admin.locator('[data-aviso]').filter({ hasText: titulo }).first();
    await oculto.getByRole('button', { name: 'Restituir' }).click();
    const restituir = admin.getByRole('dialog');
    await restituir.getByLabel(/Motivo/).fill('El negocio corrigió el contenido');
    await restituir.getByRole('button', { name: 'Confirmar y restituir' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Aviso restituido' })).toBeVisible();
    await page.goto('/negocio/plan');
    await expect(page.locator('[data-aviso-oculto]')).toHaveCount(0);
    await page
      .locator('[data-aviso]')
      .filter({ hasText: titulo })
      .getByRole('button', { name: 'Quitar aviso' })
      .click();
    await admin.context().close();
  });

  test('la auditoría es de solo lectura, con filtros, y muestra lo que hizo la administración', async ({
    browser,
  }, info) => {
    const admin = await entrarAdmin(browser, info);
    await admin.goto('/admin/auditoria');
    await expect(admin.getByText('Solo se puede leer')).toBeVisible();
    await expect(admin.locator('[data-kpis]')).toContainText('Entradas');
    const tabla = admin.locator('[data-tabla-auditoria]');
    await expect(tabla).toContainText('Suspendió una cuenta');
    await expect(tabla).toContainText('Incumplimiento de acuerdos');
    await expect(tabla).toContainText('Ocultó un aviso');
    await expect(admin.getByRole('button', { name: /exportar|descargar|borrar|editar/i })).toHaveCount(0);
    await sinDesbordeHorizontal(admin);
    await admin.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Avisos' }).click();
    await expect(tabla).toContainText('Ocultó un aviso');
    await expect(tabla).not.toContainText('Suspendió una cuenta');
    await admin.getByLabel('Buscar en el registro').fill('Restituyó');
    await expect(tabla.locator('[data-entrada]').first()).toBeVisible();
    await sinDesbordeHorizontal(admin);
    await admin.context().close();
  });
});
