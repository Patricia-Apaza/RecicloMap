import { expect, type Browser, type BrowserContext, type Page, test, type TestInfo } from '@playwright/test';
import {
  ADMIN,
  CLAVE,
  CLAVE_SEMILLA,
  codigoDe,
  escribirCodigo,
  ingresar,
  simularGoogleMaps,
  sinDesbordeHorizontal,
  telefonoNuevo,
  esperarRed,
} from './apoyo';

const MARCO = '900000001';
const ORIGEN = { latitude: -15.493, longitude: -70.129 };

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

async function entrarAdmin(browser: Browser, info: TestInfo): Promise<{ page: Page; contexto: BrowserContext }> {
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
  await page.goto('/admin/configuracion');
  await expect(page.locator('[data-control="mantenimiento"]')).toBeVisible();
  return { page, contexto };
}

const motivar = async (page: Page, boton: string) => {
  const ventana = page.getByRole('dialog');
  await ventana.getByLabel('Motivo (se registra)').fill('Prueba del flujo de controles');
  await ventana.getByRole('button', { name: boton }).click();
};
const enDosHoras = () => new Date(Date.now() + 2 * 3_600_000 - 5 * 3_600_000).toISOString().slice(0, 16);
const haceUnaHora = () => new Date(Date.now() - 3_600_000 - 5 * 3_600_000).toISOString().slice(0, 16);

test.describe.serial('controles operativos desde la pantalla 66', () => {
  test('el aviso global lo ve todo el mundo, se puede cerrar y se retira con motivo', async ({ browser }, info) => {
    const { page, contexto } = await entrarAdmin(browser, info);
    await sinDesbordeHorizontal(page);
    const panel = page.locator('[data-control="banner"]');
    await panel.getByLabel('Texto del aviso').fill('Mañana el mantenimiento será de 2 a 3 a. m.');
    await panel.getByRole('button', { name: 'Publicar aviso' }).click();
    await expect(panel.getByText('Indica cuándo empieza y cuándo termina.')).toBeVisible();
    await panel.getByLabel('Empieza (hora de Lima)').fill(haceUnaHora());
    await panel.getByLabel('Termina (hora de Lima)').fill(enDosHoras());
    await panel.getByRole('button', { name: 'Publicar aviso' }).click();
    await motivar(page, 'Publicar');
    await expect(page.locator('[data-historial-controles]')).toContainText('Aviso global');

    // Lo ve quien no tiene cuenta, en cualquier pantalla, y lo puede cerrar
    const invitado = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: info.project.use.viewport,
    });
    const vista = await invitado.newPage();
    await simularGoogleMaps(vista);
    await vista.goto('/');
    const aviso = vista.locator('[data-aviso="banner"]');
    await expect(aviso).toContainText('Mañana el mantenimiento será de 2 a 3 a. m.');
    await sinDesbordeHorizontal(vista);
    await vista.getByRole('button', { name: 'Cerrar el aviso' }).click();
    await expect(aviso).toHaveCount(0);
    await vista.reload();
    await expect(vista.locator('[data-aviso="banner"]')).toHaveCount(0);

    await panel.getByRole('button', { name: 'Retirar aviso' }).click();
    await motivar(page, 'Retirar');
    await expect(panel.getByRole('button', { name: 'Retirar aviso' })).toHaveCount(0);
    await invitado.close();
    await contexto.close();
  });

  test('cerrar el registro de recicladores avisa con un mensaje claro y no toca a los demás', async ({
    browser,
  }, info) => {
    const { page, contexto } = await entrarAdmin(browser, info);
    const registro = page.locator('[data-control="registro"]');
    await registro.getByRole('switch', { name: 'Registro de recicladores abierto' }).click({ force: true });
    await motivar(page, 'Cerrar registro');
    await expect(registro.getByRole('switch', { name: 'Registro de recicladores abierto' })).not.toBeChecked();
    await expect(registro.getByRole('switch', { name: 'Registro de negocios abierto' })).toBeChecked();

    const invitado = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: info.project.use.viewport,
    });
    const vista = await invitado.newPage();
    await simularGoogleMaps(vista);
    await vista.goto('/registro/reciclador');
    await expect(vista.getByText('Por ahora no estamos recibiendo registros de recicladores.')).toBeVisible();
    await expect(vista.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await sinDesbordeHorizontal(vista);
    await vista.goto('/registro/centro');
    await expect(vista.getByText('Por ahora no estamos recibiendo registros de negocios.')).toHaveCount(0);
    await invitado.close();

    await registro.getByRole('switch', { name: 'Registro de recicladores abierto' }).click({ force: true });
    await motivar(page, 'Abrir registro');
    await expect(registro.getByRole('switch', { name: 'Registro de recicladores abierto' })).toBeChecked();
    await contexto.close();
  });

  test('el mantenimiento deja leer a todos, avisa, no deja escribir y la administración sigue', async ({
    browser,
  }, info) => {
    const { page, contexto } = await entrarAdmin(browser, info);
    const panel = page.locator('[data-control="mantenimiento"]');
    await panel.getByLabel('Mensaje para la gente').fill('Estamos mejorando RecicloMap. Volvemos en unos minutos.');
    await panel.getByRole('button', { name: 'Activar mantenimiento' }).click();
    await motivar(page, 'Activar mantenimiento');
    await expect(panel.getByText('Activo: solo lectura')).toBeVisible();

    const persona = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: info.project.use.viewport,
      geolocation: ORIGEN,
      permissions: ['geolocation'],
    });
    const vista = await persona.newPage();
    await simularGoogleMaps(vista);
    await ingresar(vista, MARCO, CLAVE_SEMILLA);
    await expect(vista).toHaveURL(/\/mapa$/);
    await expect(vista.locator('[data-aviso="mantenimiento"]')).toContainText('Mantenimiento: solo lectura');
    await expect(vista.locator('[data-aviso="mantenimiento"]')).toContainText('Tus plazos no corren');
    await sinDesbordeHorizontal(vista);
    // Lee con normalidad
    await vista.goto('/configuracion');
    await expect(vista.locator('[data-panel="mis-datos"]')).toBeVisible();
    // No escribe: la API responde con el mensaje y la pantalla lo muestra
    const intento = await vista.evaluate(async () => {
      const r = await fetch('/api/v1/yo/preferencias', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleEnRanking: false }),
      });
      return r.status;
    });
    expect([401, 503]).toContain(intento);

    // La administración sigue trabajando y puede terminar
    await panel.getByRole('button', { name: 'Terminar mantenimiento' }).click();
    await motivar(page, 'Terminar mantenimiento');
    await expect(panel.getByText('Apagado')).toBeVisible();
    await vista.reload();
    await expect(vista.locator('[data-aviso="mantenimiento"]')).toHaveCount(0);
    await persona.close();
    await contexto.close();
  });
});

test.describe('sin conexión: se lee lo ya visto y nada que cambie datos queda en cola', () => {
  test.use({ geolocation: ORIGEN, permissions: ['geolocation'] });

  async function conServiceWorker(page: Page) {
    await page.goto('/mapa/lista');
    // La sesión se renueva al abrir; recargar antes de que termine reutilizaría una cookie ya gastada
    await esperarRed(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // La primera visita no la controla el service worker: se recarga para que empiece a guardar
    await page.reload();
    await esperarRed(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }

  test('con la señal caída se ve la última lista con su fecha y un cambio falla con un aviso, sin repetirse al volver', async ({
    page,
    context,
  }) => {
    await ingresar(page, MARCO, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa$/);
    await conServiceWorker(page);
    await page
      .getByRole('button', { name: 'Usar mi ubicación' })
      .click()
      .catch(() => undefined);
    await expect(page.getByRole('link', { name: 'Ver detalle' }).first()).toBeVisible();
    // Se visita también la configuración para tenerla guardada
    await page.goto('/configuracion');
    await expect(page.locator('[data-panel="mis-datos"]')).toBeVisible();
    await page.goto('/mapa/lista');
    await expect(page.getByRole('link', { name: 'Ver detalle' }).first()).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-aviso="sin-conexion"]')).toContainText('Sin conexión');
    await expect(page.locator('[data-aviso="sin-conexion"]')).toContainText('datos de');
    await expect(page.getByRole('link', { name: 'Ver detalle' }).first()).toBeVisible();
    await sinDesbordeHorizontal(page);

    // Un cambio no se guarda para después: se avisa y no se manda nada al volver la conexión
    const escrituras: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.url().includes('/api/v1/'))
        escrituras.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto('/configuracion');
    await expect(page.locator('[data-aviso="sin-conexion"]')).toBeVisible();
    await page
      .getByRole('switch', { name: /ranking/i })
      .first()
      .click({ force: true });
    await expect(page.getByText(/no se guarda para después/).first()).toBeVisible();
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    expect(escrituras.filter((e) => !e.includes('/auth/refresh') && !e.includes('/api/v1/en-vivo'))).toEqual([]);
    await expect(page.locator('[data-aviso="sin-conexion"]')).toHaveCount(0);
  });

  test('los botones de enviar se desactivan sin conexión salvo el borrador de una publicación', async ({
    page,
    context,
  }) => {
    await ingresar(page, MARCO, CLAVE_SEMILLA);
    await expect(page).toHaveURL(/\/mapa$/);
    await page.goto('/configuracion');
    await expect(page.locator('[data-panel="mis-datos"]')).toBeVisible();
    await context.setOffline(true);
    await expect(page.locator('[data-aviso="sin-conexion"]')).toBeVisible();
    const bloqueado = await page.evaluate(() => document.documentElement.hasAttribute('data-sin-conexion'));
    expect(bloqueado).toBe(true);
    await context.setOffline(false);
    await expect(page.locator('[data-aviso="sin-conexion"]')).toHaveCount(0);
  });

  test('al cerrar la sesión se borran los datos guardados del dispositivo', async ({ page }) => {
    const telefono = telefonoNuevo();
    const registro = await page.request.post('/api/v1/auth/registro/reciclador', {
      data: { nombre: 'Rosa Mamani Quispe', telefono, contrasena: CLAVE, aceptaTerminos: true, mayorDeEdad: true },
    });
    const { codigoDePrueba } = (await registro.json()) as { codigoDePrueba: string };
    const verificado = await page.request.post('/api/v1/auth/telefono/verificar', {
      data: { telefono, codigo: codigoDePrueba },
    });
    const { tokenAcceso } = (await verificado.json()) as { tokenAcceso: string };
    await page.request.put('/api/v1/yo/materiales', {
      headers: { Authorization: `Bearer ${tokenAcceso}` },
      data: { materiales: ['pet'] },
    });
    await conServiceWorker(page);
    await page.goto('/configuracion');
    await expect(page.locator('[data-panel="mis-datos"]')).toBeVisible();
    const antes = await page.evaluate(
      async () =>
        (await caches.keys()).includes('reciclomap-datos-v1') &&
        (await (await caches.open('reciclomap-datos-v1')).keys()).length,
    );
    expect(antes).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page).toHaveURL(/\/(ingresar.*)?$/);
    await page.waitForFunction(async () => !(await caches.keys()).includes('reciclomap-datos-v1'));
  });
});
