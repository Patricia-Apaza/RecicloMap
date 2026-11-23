import { expect, type Page, test } from '@playwright/test';
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

async function entrarComoAdmin(page: Page): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo o teléfono').fill(ADMIN);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE_SEMILLA);
  const codigo = await codigoDe(page, '/auth/login', () => page.getByRole('button', { name: 'Ingresar' }).click());
  await escribirCodigo(page, codigo);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function comoInvitado(page: Page, destino: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar como invitado' }).first().click();
  await expect(page).toHaveURL(/\/mapa$/);
  await page.goto(destino);
}

async function elegirZona(page: Page): Promise<void> {
  await page.getByLabel('O elige tu zona').selectOption({ label: 'Barrio Santa Rosa' });
}

test.describe.serial('descubrimiento: calculadora, comparar, favoritos y cómo llegar (18, 20, 19, 21)', () => {
  test('el invitado usa la calculadora y ve un semáforo con texto', async ({ page }) => {
    await comoInvitado(page, '/calculadora');
    await elegirZona(page);
    await expect(page.locator('[data-estimado]')).toContainText('Valor estimado');
    await expect(page.locator('[data-opcion]').first()).toBeVisible();
    await expect(page.locator('[data-opcion]').first()).toContainText(
      /Mejor precio|Precio intermedio|Precio bajo|Sin comparación/,
    );
    await page.getByLabel('2. Kilos que tienes').fill('0');
    await expect(page.getByText('Escribe un número mayor a 0')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('el reciclador guarda un favorito, lo ve con alertas y lo compara', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/calculadora');
    await elegirZona(page);
    await page.locator('[data-opcion]').first().click();
    await expect(page.locator('[data-acciones-negocio]')).toBeVisible();
    const guardar = page.getByRole('button', { name: 'Guardar', exact: true });
    if (await guardar.isVisible()) await guardar.click();
    await expect(page.getByRole('button', { name: 'Guardado' })).toBeVisible();
    await sinDesbordeHorizontal(page);

    await page.goto('/favoritos');
    const tarjeta = page.locator('[data-favorito]').first();
    await expect(tarjeta).toBeVisible();
    const alerta = tarjeta.getByRole('switch', { name: 'Avisarme si cambia un precio' });
    const antes = await alerta.isChecked();
    await alerta.evaluate((el: HTMLInputElement) => el.click());
    if (antes) await expect(alerta).not.toBeChecked();
    else await expect(alerta).toBeChecked();
    await sinDesbordeHorizontal(page);

    await page.goto('/comparar');
    await expect(page.getByText('Elige al menos 2 compradores')).toBeVisible();
  });

  test('cómo llegar no avisa al negocio: abre Google Maps solo con el destino', async ({ page }) => {
    await comoInvitado(page, '/calculadora');
    await elegirZona(page);
    await page.locator('[data-opcion]').first().click();
    await page.getByRole('link', { name: 'Cómo llegar' }).click();
    await expect(page.locator('[data-destino]')).toBeVisible();
    await expect(page.getByText('No usamos tu GPS')).toHaveCount(0);
    const enlace = page.getByRole('link', { name: 'Abrir en Google Maps' });
    await expect(enlace).toHaveAttribute('href', /destination=-?\d+\.\d+,-?\d+\.\d+$/);
    expect(await enlace.getAttribute('href')).not.toContain('origin');
    await sinDesbordeHorizontal(page);
  });
});

test.describe.serial('confianza: reportar, corregir, moderar y ocultar (16, 49, 60, 61)', () => {
  test('el reciclador reporta; el invitado no puede; el negocio ve el reporte sin autor', async ({
    page,
    browser,
  }, testInfo) => {
    // Cada proyecto reporta un motivo distinto: un mismo reporte abierto no se repite
    const motivo = testInfo.project.name.startsWith('movil') ? /Información falsa/ : /^Otro/;
    await comoInvitado(page, '/reportar');
    await expect(page).not.toHaveURL(/\/reportar$/);

    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/mapa');
    await elegirZona(page);
    await page.goto('/reportar');

    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Elige el negocio.')).toBeVisible();
    await page.getByLabel(/¿Dónde\?/).selectOption({ label: 'Acopio Titicaca · Centro de acopio' });
    await page.getByRole('button', { name: motivo }).click();
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('Cuéntanos un poco más')).toBeVisible();
    await page.getByLabel(/Detalle/).fill('Publica un rango que no existe en la realidad.');
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(page.getByText('¡Gracias por avisarnos!')).toBeVisible();
    await expect(page.getByText('El negocio no sabrá quién', { exact: false })).toHaveCount(0);
    await sinDesbordeHorizontal(page);

    const contexto = await browser.newContext();
    const negocio = await contexto.newPage();
    await entrarComo(negocio, TITICACA, /\/negocio$/);
    await negocio.goto('/negocio/reportes');
    await expect(negocio.locator('[data-reporte]').first()).toBeVisible();
    await expect(negocio.getByText('Marco')).toHaveCount(0);
    await sinDesbordeHorizontal(negocio);
    await contexto.close();
  });

  test('el administrador pide corrección con plazo, oculta una reseña y suspende un precio sin poder editarlo', async ({
    page,
  }) => {
    await entrarComoAdmin(page);
    await page.goto('/admin/reportes');
    const fila = page.locator('[data-reporte]').first();
    await expect(fila).toBeVisible();
    await expect(page.getByRole('button', { name: /editar/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Pedir corrección al negocio' }).first().click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: 'Pedir corrección' }).click();
    await expect(dialogo.getByText('Elige un plazo.')).toBeVisible();
    await dialogo.getByLabel('Plazo para corregir').selectOption({ index: 1 });
    await dialogo.getByLabel(/Motivo/).fill('Revisa tu información en el mapa.');
    await dialogo.getByRole('button', { name: 'Pedir corrección' }).click();
    await expect(dialogo).toBeHidden();
    await sinDesbordeHorizontal(page);

    await page.goto('/admin/reportes?tipo=RESENA');
    await expect(page.locator('[data-resena-reportada]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Ocultar la reseña' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Motivo/)
      .fill('Afirma algo que no ocurrió.');
    await page.getByRole('dialog').getByRole('button', { name: 'Ocultar la reseña' }).click();
    await expect(page.getByText('Reseña oculta')).toBeVisible();

    await page.goto('/admin/precios');
    await expect(page.getByRole('heading', { name: /no edites/ })).toBeVisible();
    await expect(page.getByText('Sin botón de editar, a propósito.')).toBeVisible();
    const precio = page.locator('[data-precio]').first();
    await precio.getByRole('button', { name: 'Suspender' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Motivo/)
      .fill('Rango fuera de lo razonable.');
    await page.getByRole('dialog').getByRole('button', { name: 'Suspender visibilidad' }).click();
    await expect(page.getByText('El precio no se modificó')).toBeVisible();
    await expect(precio.getByText('Suspendido')).toBeVisible();
    await precio.getByRole('button', { name: 'Restituir' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Motivo/)
      .fill('Se revisó y está bien.');
    await page.getByRole('dialog').getByRole('button', { name: 'Restituir' }).click();
    await expect(precio.getByText('Sin marcar')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });
});

test.describe('cuenta y negocio: perfil, ayuda, configuración y datos (22, 38, 39, 47)', () => {
  test('el reciclador edita su perfil y ve sus reseñas recibidas', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/perfil/editar');
    await expect(page.getByLabel('Nombre y apellido')).toBeVisible();
    await page.getByLabel('Nombre y apellido').fill('Ma');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Escribe tu nombre')).toBeVisible();
    await page.getByLabel('Nombre y apellido').fill('Marco Quispe');
    await page.getByLabel('Sobre ti').fill('Recojo en el mercado todos los días.');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Perfil actualizado')).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar' }).click();
    await expect(page.getByRole('dialog', { name: 'Cambia tu número' })).toBeVisible();
    await sinDesbordeHorizontal(page);

    await page.goto('/perfil/resenas');
    await expect(page.locator('[data-resena]').first()).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('ayuda coherente con las reglas y configuración sin botones muertos', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/ayuda');
    await page.getByLabel('Buscar en la ayuda').fill('dos compradores');
    await page.getByRole('button', { name: /solo hay dos compradores/ }).click();
    await expect(page.getByText('«Mejor precio» y la otra «Precio bajo»', { exact: false })).toBeVisible();
    await page.getByLabel('Buscar en la ayuda').fill('desafíos');
    await page.getByRole('button', { name: /Cada cuánto cambian los desafíos/ }).click();
    await expect(page.getByText('Los desafíos son mensuales')).toBeVisible();
    await sinDesbordeHorizontal(page);

    await page.goto('/configuracion');
    const ciudades = page.locator('[data-ciudades]');
    await expect(ciudades).toContainText('Juliaca');
    await expect(ciudades).toContainText('Próximamente');
    await ciudades.getByRole('button', { name: 'Avisarme cuando abra' }).first().click();
    await expect(ciudades.getByText('Te avisaremos').first()).toBeVisible();
    // Los datos propios y la eliminación existen de verdad (13A): descargar y eliminar, cada uno con su confirmación
    await expect(page.getByRole('button', { name: 'Descargar mis datos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('el negocio guarda su horario y pide cambiar su dirección sin dejar de verse', async ({ page }) => {
    await entrarComo(page, TITICACA, /\/negocio$/);
    await page.goto('/negocio/datos');
    await expect(page.getByLabel('Nombre del negocio')).toBeVisible();
    await page.getByLabel('Descripción').fill('Báscula calibrada.');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Datos guardados')).toBeVisible();
    await sinDesbordeHorizontal(page);

    const solicitar = page.getByRole('button', { name: 'Solicitar cambio de dirección' });
    if (await solicitar.isVisible()) {
      await solicitar.click();
      await page.getByLabel('Nueva dirección').fill('Jr. Moquegua 480, Juliaca');
      await page.getByLabel('Zona', { exact: true }).selectOption({ index: 1 });
      await page.getByRole('button', { name: 'Enviar a verificación' }).click();
    }
    await expect(page.locator('[data-cambio-direccion]')).toContainText('Sigues visible con la dirección actual');
    await expect(page.locator('[data-cambio-direccion]')).toContainText('Jr. Moquegua 450');
  });

  test('"Hubo un problema" lleva a reportar y el seguimiento muestra 7 pasos', async ({ page }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto('/comprador/compras');
    await page
      .getByRole('group', { name: 'Mostrar' })
      .getByRole('button', { name: /^Completadas/ })
      .click();
    await page.getByRole('link', { name: 'Ver seguimiento' }).first().click();
    await expect(page.locator('[data-paso]')).toHaveCount(7);
    await page.locator('[data-hubo-problema]').click();
    await expect(page).toHaveURL(/\/operaciones\/reportar\?operacion=/);
    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    await expect(
      page.getByText('Elige qué pasó', { exact: false }).or(page.getByText('Elige una opción.')),
    ).toBeVisible();
    await sinDesbordeHorizontal(page);
  });
});
