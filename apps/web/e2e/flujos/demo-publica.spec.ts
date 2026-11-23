import path from 'node:path';
import { expect, test } from '@playwright/test';
import { codigoDe, escribirCodigo, telefonoNuevo } from './apoyo';

const FOTO = path.join(import.meta.dirname, 'archivos', 'local.jpg');
const CLAVE_NUEVA = 'ClaveNueva-2026-x';

// Se ejecuta contra el enlace público del túnel (playwright.publico.config.ts), sin sustitutos de mapas ni de nada:
// lo que ve una persona desde otra red
test.describe('enlace público de la demostración', () => {
  test('cartel de demostración, registro con el código en pantalla, mapa con teselas reales, foto y sin conexión', async ({
    page,
    context,
  }) => {
    const origen = new URL(test.info().project.use.baseURL!).origin;
    const teselas: Array<{ url: string; referer: string; estado: number }> = [];
    page.on('response', (respuesta) => {
      const url = respuesta.url();
      if (url.startsWith('https://tile.openstreetmap.org/')) {
        teselas.push({ url, referer: respuesta.request().headers().referer ?? '', estado: respuesta.status() });
      }
    });

    // Cartel: toda la aplicación, también antes de entrar
    await page.goto('/');
    await expect(page.locator('[data-aviso="demostracion"]')).toContainText(
      'Versión de demostración académica: datos de prueba; SMS y correo simulados',
    );
    await expect(page.locator('[data-aviso="demostracion"] button')).toHaveCount(0);

    // Registro con el código de prueba visible en pantalla (solo demostración)
    const telefono = telefonoNuevo();
    await page.goto('/');
    await page.getByRole('link', { name: 'Soy reciclador' }).click();
    await page.getByLabel('Nombre completo').fill('Rosa Mamani Quispe');
    await page.getByLabel('Teléfono (WhatsApp)').fill(telefono);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE_NUEVA);
    await page.getByRole('checkbox', { name: /Acepto/ }).check();
    await page.getByRole('checkbox', { name: /mayor de 18/ }).check();
    const codigo = await codigoDe(page, '/auth/registro/reciclador', () =>
      page.getByRole('button', { name: 'Continuar' }).click(),
    );
    await expect(page).toHaveURL(/\/verificar-telefono$/);
    await expect(page.locator('[data-codigo-prueba]')).toContainText(`Solo desarrollo: código de prueba ${codigo}`);
    await escribirCodigo(page, codigo);
    await page.getByRole('button', { name: 'Verificar teléfono' }).click();
    await expect(page).toHaveURL(/\/registro\/materiales$/);
    await page.getByLabel('PET').check();
    await page.getByRole('button', { name: 'Finalizar registro' }).click();
    await page
      .getByRole('dialog', { name: '¡Bienvenido a RecicloMap!' })
      .getByRole('button', { name: 'Ir al mapa' })
      .click();
    await expect(page).toHaveURL(/\/mapa$/);
    await expect(page.locator('[data-aviso="demostracion"]')).toBeVisible();

    // La cookie de sesión es segura y la sesión sobrevive a recargar
    const cookies = await context.cookies();
    const sesion = cookies.find((c) => c.name === 'rm_refresco');
    expect(sesion?.secure).toBe(true);
    expect(sesion?.httpOnly).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/mapa$/);

    // Mapa: teselas reales de OpenStreetMap con el Referer de la dirección pública y la atribución visible
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await expect(page.locator('[data-mapa="osm"] .leaflet-tile-loaded').first()).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('[data-mapa="osm"] .leaflet-control-attribution')).toContainText('OpenStreetMap');
    expect(teselas.length).toBeGreaterThan(0);
    expect(teselas.every((t) => t.estado === 200)).toBe(true);
    expect(teselas.every((t) => t.referer.startsWith(origen))).toBe(true);

    // Foto de perfil: sube por el mismo origen y se guarda
    await page.goto('/perfil/editar');
    await page.locator('input[type="file"]').setInputFiles(FOTO);
    await expect(page.getByText('Cambiar foto')).toBeVisible({ timeout: 20_000 });

    // Servicio sin conexión con https en otro dominio: se registra y sin señal se abre lo ya visitado
    await page.goto('/ayuda');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.goto('/ayuda').catch(() => undefined);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await context.setOffline(false);
  });
});
