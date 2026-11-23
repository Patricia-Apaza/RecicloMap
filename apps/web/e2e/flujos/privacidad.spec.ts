import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  CLAVE,
  CLAVE_SEMILLA,
  codigoDe,
  ingresar,
  simularGoogleMaps,
  sinDesbordeHorizontal,
  crearRecicladorListo,
  telefonoNuevo,
} from './apoyo';

const MARCO = '900000001';

// La interfaz no puede provocar sola algunas situaciones (textos nuevos, un premio ganado): una herramienta de pruebas las prepara
function preparar(accion: 'textos-antiguos' | 'premio-por-reclamar', telefono: string) {
  execFileSync('pnpm', ['--filter', '@reciclomap/api', 'pruebas:preparar', accion, telefono], {
    env: { ...process.env, RM_BD_OBJETIVO: 'pruebas', NODE_ENV: 'test' },
    stdio: 'pipe',
  });
}

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

test.describe.serial('privacidad: consentimientos, exportar datos y eliminar la cuenta (39, 40)', () => {
  test('el registro pide aceptar los textos y declarar ser mayor de 18 años', async ({ page }) => {
    await page.goto('/registro/reciclador');
    await sinDesbordeHorizontal(page);
    await page.getByLabel('Nombre completo').fill('Rosa Mamani Quispe');
    await page.getByLabel('Teléfono (WhatsApp)').fill(telefonoNuevo());
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByRole('checkbox', { name: /Acepto/ }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Debes declarar que eres mayor de 18 años.')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('los textos legales describen lo que hace el sistema y dan el canal de derechos', async ({ page }) => {
    await page.goto('/terminos');
    await expect(page.getByRole('heading', { name: /Términos y/ })).toBeVisible();
    await expect(page.getByText(/versión 2026-12/)).toBeVisible();
    for (const titulo of [
      'Qué datos recogemos y para qué',
      'Quién ve tus datos',
      'Servicios de terceros',
      'Cuánto tiempo guardamos tus datos',
      'Tus derechos y cómo ejercerlos',
    ]) {
      await expect(page.getByRole('heading', { name: new RegExp(titulo) })).toBeVisible();
    }
    await expect(page.getByText(/OpenStreetMap/).first()).toBeVisible();
    await expect(page.getByText(/Búsqueda de direcciones/)).toBeVisible();
    await expect(page.getByText(/Google no recibe nada por ver el mapa/)).toBeVisible();
    await expect(page.getByText(/soporte@reciclomap\.pe/).first()).toBeVisible();
    await expect(page.getByText('pendiente de revisión legal').first()).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('descargar mis datos pide la contraseña y se permite una vez por día', async ({ page }) => {
    await crearRecicladorListo(page);
    // El registro por API dejó la sesión abierta en este navegador
    await page.goto('/configuracion');
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
    const panel = page.locator('[data-panel="mis-datos"]');
    await expect(panel).toBeVisible();
    await sinDesbordeHorizontal(page);
    await panel.getByRole('button', { name: 'Descargar mis datos' }).click();
    const ventana = page.getByRole('dialog', { name: 'Confirma tu contraseña' });
    await ventana.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await ventana.getByRole('button', { name: 'Descargar' }).click();
    await expect(ventana.getByText('La contraseña no es correcta.')).toBeVisible();
    await ventana.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      ventana.getByRole('button', { name: 'Descargar' }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^reciclomap-datos-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(panel.getByText('Ya descargaste tus datos hoy.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Descargar mis datos' })).toBeDisabled();
  });

  test('eliminar la cuenta explica qué pasa, bloquea si hay algo pendiente y dice dónde resolverlo', async ({
    page,
  }) => {
    await ingresar(page, MARCO, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/configuracion');
    const zona = page.locator('[data-panel="zona-de-riesgo"]');
    await expect(zona).toBeVisible();
    await sinDesbordeHorizontal(page);
    await zona.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    const ventana = page.getByRole('dialog', { name: '¿Seguro que quieres irte?' });
    await expect(ventana.locator('[data-bloqueos]')).toBeVisible();
    await expect(ventana.locator('[data-bloqueo="operaciones"]')).toContainText('Operaciones en curso');
    await expect(ventana.getByRole('link', { name: 'Ir ahí' }).first()).toBeVisible();
    await expect(ventana.getByRole('button', { name: 'Enviarme un código al teléfono' })).toHaveCount(0);
  });

  test('con la cuenta libre: contraseña, código y ELIMINAR; la gracia deja cancelar al iniciar sesión', async ({
    page,
  }) => {
    const telefono = await crearRecicladorListo(page);
    // El registro por API dejó la sesión abierta en este navegador
    await page.goto('/configuracion');
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
    await page.locator('[data-panel="zona-de-riesgo"]').getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    const ventana = page.getByRole('dialog', { name: '¿Seguro que quieres irte?' });
    await expect(ventana.getByText(/Tienes 7 días/).first()).toBeVisible();
    await ventana.getByLabel('Tu contraseña').fill(CLAVE);
    const codigo = await codigoDe(page, '/yo/eliminacion/codigo', () =>
      ventana.getByRole('button', { name: 'Enviarme un código al teléfono' }).click(),
    );
    await expect(ventana.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeDisabled();
    await ventana.getByLabel('Código que te enviamos por SMS').fill(codigo);
    await ventana.getByLabel('Para confirmar, escribe ELIMINAR').fill('ELIM');
    await ventana.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(ventana.getByText('Escribe ELIMINAR para confirmar.')).toBeVisible();
    await ventana.getByLabel('Para confirmar, escribe ELIMINAR').fill('ELIMINAR');
    await ventana.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    // Al terminar, el ingreso explica que la cuenta queda inactiva y se reactiva si inicia sesión
    await expect(page).toHaveURL(/\/ingresar\?aviso=eliminacion$/);
    await expect(page.getByText(/Tu cuenta quedó inactiva por 7 días/)).toBeVisible();
    await sinDesbordeHorizontal(page);

    // Durante la gracia la cuenta no opera: al iniciar sesión solo puede cancelar
    await ingresar(page, telefono, CLAVE);
    await expect(page).toHaveURL(/\/cuenta\/eliminacion$/);
    await expect(page.getByRole('heading', { name: 'Tu cuenta está en proceso de eliminación' })).toBeVisible();
    await expect(page.locator('[data-eliminacion]')).toContainText('Se anonimizará de forma definitiva el');
    await sinDesbordeHorizontal(page);
    await page.goto('/configuracion');
    await expect(page).toHaveURL(/\/cuenta\/eliminacion$/);
    await page.getByRole('button', { name: 'Cancelar la eliminación y quedarme' }).click();
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/configuracion');
    await expect(page.locator('[data-panel="zona-de-riesgo"]')).toBeVisible();
  });

  test('«Textos legales actualizados»: con una versión nueva hay que aceptar antes de seguir', async ({ page }) => {
    const telefono = await crearRecicladorListo(page);
    preparar('textos-antiguos', telefono);
    await page.goto('/mapa');
    await expect(page).toHaveURL(/\/aceptar-textos$/);
    await expect(page.getByRole('heading', { name: 'Textos legales actualizados' })).toBeVisible();
    await sinDesbordeHorizontal(page);
    // Sin aceptar no se avanza, y otras pantallas la devuelven aquí
    await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
    await expect(page.getByText('Debes aceptar para continuar.')).toBeVisible();
    await page.goto('/configuracion');
    await expect(page).toHaveURL(/\/aceptar-textos$/);
    await page.getByRole('checkbox', { name: /Acepto/ }).check();
    await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/configuracion');
    await expect(page.locator('[data-panel="mis-datos"]')).toBeVisible();
  });

  test('«No acepto» cierra la sesión', async ({ page }) => {
    const telefono = await crearRecicladorListo(page);
    preparar('textos-antiguos', telefono);
    await page.goto('/mapa');
    await expect(page).toHaveURL(/\/aceptar-textos$/);
    await page.getByRole('button', { name: 'No acepto, cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/(ingresar.*)?$/);
    await page.goto('/configuracion');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('renunciar a un premio lo explica, pide confirmación y destraba la eliminación de la cuenta', async ({
    page,
  }) => {
    const telefono = await crearRecicladorListo(page);
    preparar('premio-por-reclamar', telefono);
    await page.goto('/puntos/premios');
    const fila = page.locator('[data-premio-ganado="POR_RECLAMAR"]').first();
    await expect(fila).toBeVisible();
    await sinDesbordeHorizontal(page);
    // Con el premio pendiente no se puede eliminar la cuenta
    await page.goto('/configuracion');
    await page.locator('[data-panel="zona-de-riesgo"]').getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(page.getByRole('dialog').locator('[data-bloqueo="premios"]')).toContainText('renunciar al premio');
    await page.getByRole('button', { name: 'Entendido' }).click();

    await page.goto('/puntos/premios');
    await page.getByRole('button', { name: 'Renunciar a este premio' }).first().click();
    const ventana = page.getByRole('dialog');
    await expect(ventana.getByText(/no se puede deshacer/)).toBeVisible();
    await expect(ventana.getByText(/no vuelve a la ruleta/)).toBeVisible();
    await ventana.getByRole('button', { name: 'Me lo quedo' }).click();
    await expect(fila).toBeVisible();
    await page.getByRole('button', { name: 'Renunciar a este premio' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, renuncio a este premio' }).click();
    await expect(page.locator('[data-premio-ganado="RENUNCIADO"]').first()).toContainText('Renunciaste');
    await sinDesbordeHorizontal(page);

    await page.goto('/configuracion');
    await page.locator('[data-panel="zona-de-riesgo"]').getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(page.getByRole('button', { name: 'Enviarme un código al teléfono' })).toBeVisible();
  });
});
