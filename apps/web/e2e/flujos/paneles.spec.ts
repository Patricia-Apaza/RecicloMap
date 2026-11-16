import { expect, type Page, test } from '@playwright/test';
import {
  ADMIN,
  CLAVE_SEMILLA,
  codigoDe,
  escribirCodigo,
  ingresar,
  simularGoogleMaps,
  sinDesbordeHorizontal,
} from './apoyo';

const TITICACA = '900000011';
const RUBEN = '900000021';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

async function entrarComo(page: Page, telefono: string, destino: RegExp): Promise<void> {
  await ingresar(page, telefono, CLAVE_SEMILLA);
  await expect(page).toHaveURL(destino);
  await page.waitForLoadState('networkidle');
}

test.describe.serial('paneles del negocio (41, 46, 50, 53, 55, 56)', () => {
  test('el centro Pro ve su resumen y sus estadísticas completas, también a 90 días', async ({ page }) => {
    await entrarComo(page, TITICACA, /\/negocio$/);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
    await expect(page.getByText('Plan Pro')).toBeVisible();
    await expect(page.locator('[data-panel="solicitudes"]')).toContainText('Reciclador · Juliaca');
    await expect(page.locator('[data-panel="solicitudes"]')).not.toContainText('Marco');
    await sinDesbordeHorizontal(page);

    await page.goto('/negocio/estadisticas');
    await expect(page.locator('[data-panel="visitas"]')).toBeVisible();
    await expect(page.locator('[data-panel="horas"]')).toBeVisible();
    await expect(page.locator('[data-panel="consultados"]')).toBeVisible();
    await page.getByRole('group', { name: 'Período' }).getByRole('button', { name: '90 días' }).click();
    await expect(page.locator('[data-panel="horas"]')).toBeVisible();
    await expect(page.locator('[data-bloque-pro]')).toHaveCount(0);
    await expect(page.locator('[data-panel="mercado"]')).toContainText(
      /Mejor precio|Precio intermedio|Precio bajo|Sin comparación/,
    );
    await sinDesbordeHorizontal(page);
  });

  test('el plan Gratis ve el bloque Pro bloqueado, sin botón de solicitud ni precios del plan', async ({ page }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto('/comprador/estadisticas');
    await expect(page.locator('[data-panel="kg"]')).toBeVisible();
    await expect(page.locator('[data-bloque-pro]').first()).toContainText('Disponible con plan Pro');
    await expect(page.locator('[data-panel="horas"]')).toHaveCount(0);
    await page
      .getByRole('group', { name: 'Período' })
      .getByRole('button', { name: /90 días/ })
      .click();
    await expect(page.locator('[data-bloque-pro]')).toContainText('Estadísticas de 90 días');
    await expect(page.locator('[data-panel="visitas"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /solicitar|activar|pagar/i })).toHaveCount(0);
    await sinDesbordeHorizontal(page);

    await page.goto('/negocio/plan');
    await expect(page.locator('[data-panel="plan"]')).toContainText('Plan Gratis');
    await expect(page.getByRole('button', { name: /solicitar|activar|pagar/i })).toHaveCount(0);
    await expect(page.locator('[data-panel="plan"]')).not.toContainText('S/');
  });

  test('los avisos rechazan precios, teléfonos y enlaces; se publican y se quitan', async ({ page }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto('/negocio/plan');
    await expect(page.locator('[data-limites]')).toContainText('avisos activos');
    const titulo = `Paso por Santa Rosa ${Date.now() % 100000}`;
    await page.getByLabel('Título').fill(titulo);
    await page.getByLabel(/Mensaje/).fill('Pagamos S/ 2.80 por kg');
    await page.getByRole('button', { name: 'Publicar aviso' }).click();
    await expect(page.getByText('No incluyas precios')).toBeVisible();
    await page.getByLabel(/Mensaje/).fill('Escríbeme al 951 234 567');
    await page.getByRole('button', { name: 'Publicar aviso' }).click();
    await expect(page.getByText('No incluyas teléfonos')).toBeVisible();
    await page.getByLabel(/Mensaje/).fill('Más info en www.mi-acopio.pe');
    await page.getByRole('button', { name: 'Publicar aviso' }).click();
    await expect(page.getByText('No incluyas enlaces')).toBeVisible();
    await sinDesbordeHorizontal(page);

    await page.getByLabel(/Mensaje/).fill('Escríbeme para coordinar el recojo.');
    await page.getByRole('button', { name: 'Publicar aviso' }).click();
    const aviso = page.locator('[data-aviso]').filter({ hasText: titulo });
    await expect(aviso).toBeVisible();
    await aviso.getByRole('button', { name: 'Quitar aviso' }).click();
    await expect(page.locator('[data-aviso]').filter({ hasText: titulo })).toHaveCount(0);
  });

  test('el reciclador ve los avisos y la ruta de hoy en la ficha del negocio', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continuar como invitado' }).first().click();
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/avisos');
    await expect(page.locator('[data-aviso]').first()).toBeVisible();
    await page.locator('[data-aviso]').first().getByRole('link').click();
    await expect(page).toHaveURL(/\/negocios\/[0-9a-f-]+/);
    await expect(page.locator('[data-avisos-negocio]')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('el comprador móvil arma su ruta de hoy, la publica y su estado pide la posición solo «En ruta»', async ({
    page,
  }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto('/comprador/ruta');
    await expect(page.getByRole('heading', { name: /Tu ruta de/ })).toBeVisible();
    // Los dos proyectos comparten la base: si ya hay una zona elegida, no se vuelve a tocar
    await expect(page.getByRole('group', { name: 'Zonas disponibles' })).toBeVisible();
    if ((await page.locator('[data-parada]').count()) === 0) {
      await page.getByRole('group', { name: 'Zonas disponibles' }).getByRole('button').first().click();
    }
    await expect(page.locator('[data-parada]').first()).toBeVisible();
    const desde = page.locator('[data-parada]').first().getByLabel(/desde/);
    await desde.fill('13:00');
    await expect(page.getByRole('button', { name: 'Guardar ruta de hoy' })).toBeDisabled();
    await desde.fill('08:30');
    await page.getByRole('button', { name: 'Guardar ruta de hoy' }).click();
    await expect(page.getByText(/Tu ruta es visible|Guardamos tu ruta/)).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-parada]').first()).toBeVisible();
    await sinDesbordeHorizontal(page);

    await page.goto('/comprador');
    await expect(page.locator('[data-posicion-del-dia]')).toHaveCount(0);
    await page.getByRole('group', { name: 'Tu estado' }).getByRole('button', { name: 'En ruta' }).click();
    await expect(page.locator('[data-posicion-del-dia]')).toBeVisible();
    await expect(page.locator('[data-posicion-del-dia]')).toContainText('no se guarda historial');
    await page.getByRole('group', { name: 'Tu estado' }).getByRole('button', { name: 'Disponible' }).click();
    await expect(page.locator('[data-posicion-del-dia]')).toHaveCount(0);
    await sinDesbordeHorizontal(page);
  });

  test('el perfil del comprador móvil enlaza a sus datos y el centro no ve el día del móvil', async ({ page }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto('/comprador/perfil');
    await expect(page.locator('[data-datos-publicos]')).toContainText('WhatsApp');
    await page.getByRole('link', { name: 'Editar datos y horario' }).click();
    await expect(page).toHaveURL(/\/negocio\/datos$/);
    await sinDesbordeHorizontal(page);
  });

  test('la administración ve las alertas de colusión con su contexto y puede descartarlas con motivo', async ({
    page,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo o teléfono').fill(ADMIN);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE_SEMILLA);
    const codigo = await codigoDe(page, '/auth/login', () => page.getByRole('button', { name: 'Ingresar' }).click());
    await escribirCodigo(page, codigo);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/admin/);
    await page.goto('/admin/reportes?tipo=ALERTAS');
    await expect(page.locator('[data-alertas]')).toContainText('recibidos mayores');
    await expect(page.locator('[data-alertas]')).toContainText('nunca un bloqueo automático');
    await sinDesbordeHorizontal(page);
  });
});
