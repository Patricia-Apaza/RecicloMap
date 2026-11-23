import { expect, type Page, test } from '@playwright/test';
import {
  CLAVE_SEMILLA,
  crearRecicladorListo,
  ingresar,
  simularGoogleMaps,
  sinDesbordeHorizontal,
  esperarRed,
} from './apoyo';

const MARCO = '900000001';
const TITICACA = '900000011';
const RUBEN = '900000021';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

async function entrarComo(page: Page, telefono: string, destino: RegExp): Promise<void> {
  await ingresar(page, telefono, CLAVE_SEMILLA);
  await expect(page).toHaveURL(destino);
  await esperarRed(page);
}

async function elegirZona(page: Page): Promise<void> {
  await page.getByLabel('O elige tu zona').selectOption({ label: 'Barrio Santa Rosa' });
  await expect(page.getByText('Desde Barrio Santa Rosa')).toBeVisible();
}

test.describe.serial('publicar, ofertar y aceptar (12, 42, 44, 24, 45)', () => {
  // Kilos distintos en cada proyecto (celular y escritorio), que comparten la base
  let kg = 0;
  let titulo = '';
  test.beforeAll(() => {
    kg = 100 + Math.floor(Math.random() * 800);
    titulo = `Plástico duro · ${kg} kg`;
  });

  test('el reciclador publica con su zona y ve cuántos negocios lo verán', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/publicar');
    await expect(page.getByRole('heading', { name: /Publica lo que tienes/ })).toBeVisible();
    await page.getByRole('button', { name: 'Publicar material' }).click();
    await expect(page.getByText('Elige un material.')).toBeVisible();

    await page
      .getByRole('group', { name: '1. ¿Qué material es?' })
      .getByRole('button', { name: 'Plástico duro' })
      .click();
    await page.getByLabel('2. Kilos aproximados').fill(String(kg));
    await page.getByLabel(/Precio que esperas/).fill('1,20');
    await expect(page.getByText(titulo)).toBeVisible();
    await expect(page.locator('[data-lo-veran]')).toContainText(/Lo verán \d+ compradores y centros verificados/);
    await elegirZona(page);
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Publicar material' }).click();

    const listo = page.getByRole('dialog', { name: 'Tu material ya está publicado' });
    await expect(listo).toContainText(
      new RegExp(`${titulo}\\. Lo verán \\d+ compradores y centros de tu ciudad durante 7 días`),
    );
    await listo.getByRole('link', { name: 'Ver mis publicaciones' }).click();
    await expect(page).toHaveURL(/\/publicaciones$/);
    const fila = page.locator('[data-publicacion]').filter({ hasText: titulo });
    await expect(fila).toContainText('Disponible');
    await expect(fila).toContainText('7 días de vigencia');
    await sinDesbordeHorizontal(page);
  });

  test('un centro la ve sin datos del reciclador y oferta con el total calculado', async ({ page }) => {
    await entrarComo(page, TITICACA, /\/negocio$/);
    await page.goto('/negocio/publicaciones');
    await page.getByRole('group', { name: 'Material' }).getByRole('button', { name: 'Plástico duro' }).click();
    const tarjeta = page.locator('[data-cercana]').filter({ hasText: titulo });
    await expect(tarjeta).toContainText('Reciclador');
    await expect(tarjeta).toContainText(/Juliaca · a (menos de 1 km|1–2 km|2–5 km|más de 5 km)/);
    await expect(tarjeta).not.toContainText('Marco');
    await expect(tarjeta).not.toContainText('Santa Rosa');
    await sinDesbordeHorizontal(page);

    await tarjeta.getByRole('button', { name: 'Hacer oferta' }).click();
    const dialogo = page.getByRole('dialog', { name: titulo });
    await dialogo.getByLabel('Tu precio por kilo').fill('1.10');
    await expect(dialogo.locator('[data-total]')).toHaveText(
      `S/ ${(1.1 * kg).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.replace(
        ' ',
        ' ',
      ),
    );
    await dialogo.getByRole('button', { name: 'Enviar oferta' }).click();
    await expect(tarjeta).toContainText('Oferta enviada · S/');

    await tarjeta.getByRole('link', { name: 'Ver detalle' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${kg} kg`);
    await expect(page.locator('[data-panel="oferta"]')).toContainText('Esperando respuesta');
    await expect(page.locator('[data-reciclador]')).toContainText('Teléfono verificado');
    await sinDesbordeHorizontal(page);
  });

  test('el reciclador recibe el aviso, acepta la oferta y ve el WhatsApp del centro', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/notificaciones');
    await expect(page.getByText('Nueva oferta por tu Plástico duro').first()).toBeVisible();

    await page.goto('/ofertas');
    await page.getByRole('button', { name: new RegExp(titulo) }).click();
    const oferta = page.locator('[data-oferta]').filter({ hasText: 'Acopio Titicaca' });
    await expect(oferta).toContainText('S/ 1.10 por kg');
    await sinDesbordeHorizontal(page);
    await oferta.getByRole('button', { name: 'Aceptar oferta' }).click();
    const confirmar = page.getByRole('dialog', { name: '¿Aceptar la oferta de Acopio Titicaca?' });
    await expect(confirmar).toContainText('verá tu WhatsApp');
    await confirmar.getByRole('button', { name: 'Sí, aceptar oferta' }).click();

    await expect(page).toHaveURL(/\/operaciones\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('con Acopio Titicaca');
    await expect(page.getByRole('link', { name: 'Definir el punto de encuentro' })).toBeVisible();
    const contraparte = page.locator('[data-contraparte]');
    await expect(contraparte).toContainText('Acopio Titicaca');
    await expect(contraparte.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/51900000011\?text=/,
    );
    await sinDesbordeHorizontal(page);
  });

  test('el centro ve la oferta aceptada con el nombre corto y el WhatsApp del reciclador', async ({ page }) => {
    await entrarComo(page, TITICACA, /\/negocio$/);
    await page.goto('/negocio/ofertas');
    await page
      .getByRole('group', { name: 'Estado de las ofertas' })
      .getByRole('button', { name: /^Aceptadas/ })
      .click();
    const fila = page.locator('[data-oferta]').filter({ hasText: `${kg} kg` });
    await expect(fila).toContainText('Aceptada');
    await sinDesbordeHorizontal(page);
    await fila.getByRole('link', { name: 'Ver la oferta aceptada' }).click();
    const contraparte = page.locator('[data-contraparte]');
    await expect(contraparte).toContainText('Marco Q.');
    await expect(contraparte.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/51900000001\?text=/,
    );
    await page.goto('/notificaciones');
    await expect(page.getByText('Aceptaron tu oferta por Plástico duro').first()).toBeVisible();
  });
});

test('sin señal, la publicación queda como borrador en el celular y NO se envía sola al volver la conexión', async ({
  page,
  context,
}) => {
  // La cuenta nueva ya queda con la sesión abierta en este navegador
  await crearRecicladorListo(page);
  await page.goto('/mapa');
  await expect(page).toHaveURL(/\/mapa$/);
  await esperarRed(page);
  await page.goto('/publicar');
  await elegirZona(page);
  await page.getByRole('group', { name: '1. ¿Qué material es?' }).getByRole('button', { name: 'Papel' }).click();
  await page.getByLabel('2. Kilos aproximados').fill('8');
  await context.setOffline(true);
  await expect(page.locator('[data-aviso="sin-conexion"]')).toContainText('Sin conexión');
  await page.getByRole('button', { name: 'Publicar material' }).click();
  const guardada = page.getByRole('dialog', { name: 'La guardamos en tu celular' });
  await expect(guardada).toContainText('No se publica solo');
  await guardada.getByRole('button', { name: 'Publicar otro material' }).click();
  await expect(page.locator('[data-pendiente]')).toContainText('Papel · 8 kg');
  await expect(page.locator('[data-pendiente]')).toContainText('No se publica solo');

  // Vuelve la conexión: no se publica nada solo
  await context.setOffline(false);
  await expect(page.locator('[data-aviso="sin-conexion"]')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.goto('/publicaciones');
  await expect(page.locator('[data-publicacion]').filter({ hasText: 'Papel · 8 kg' })).toHaveCount(0);

  // La persona revisa el borrador y lo publica ella
  await page.goto('/publicar');
  await page.locator('[data-usar-borrador]').click();
  await expect(page.getByLabel('2. Kilos aproximados')).toHaveValue('8');
  await page.getByRole('button', { name: 'Publicar material' }).click();
  await expect(page.getByRole('dialog', { name: 'Tu material ya está publicado' })).toBeVisible();
  await page.goto('/publicaciones');
  await expect(page.locator('[data-publicacion]').filter({ hasText: 'Papel · 8 kg' }).first()).toContainText(
    'Disponible',
  );
});

test('el comprador móvil cambia su estado y ve el material de su ciudad (52)', async ({ page }) => {
  await entrarComo(page, RUBEN, /\/comprador$/);
  await expect(page.getByRole('heading', { name: /Compras Rubén/ })).toBeVisible();
  await expect(page.locator('[data-cercana]').first()).toBeVisible();
  await page.getByRole('group', { name: 'Tu estado' }).getByRole('button', { name: 'En ruta' }).click();
  await expect(page.locator('[data-disponibilidad="EN_RUTA"]')).toBeVisible();
  await page.getByRole('group', { name: 'Tu estado' }).getByRole('button', { name: 'Disponible' }).click();
  await expect(page.locator('[data-disponibilidad="DISPONIBLE"]')).toBeVisible();
  await sinDesbordeHorizontal(page);
});
