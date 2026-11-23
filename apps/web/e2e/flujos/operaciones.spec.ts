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
const RUBEN = '900000021';
const TITICACA = '900000011';

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

// Flujo central con los 4 roles: publicar → ofertar → aceptar → coordinar → entregar → confirmar →
// no conforme → el administrador pide corrección → el comprador corrige → conforme → calificar en ambos sentidos
test.describe.serial('operación completa con los 4 roles (25, 26, 27, 28, 54, 48, 17, 32)', () => {
  let kg = 0;
  let titulo = '';
  let operacion = '';
  test.beforeAll(() => {
    kg = 100 + (Date.now() % 800);
    titulo = `Cartón · ${kg} kg`;
  });

  test('el reciclador publica y el comprador móvil oferta', async ({ page, browser }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/publicar');
    await page.getByRole('group', { name: '1. ¿Qué material es?' }).getByRole('button', { name: 'Cartón' }).click();
    await page.getByLabel('2. Kilos aproximados').fill(String(kg));
    await page.getByLabel(/Precio que esperas/).fill('0,60');
    await page.getByLabel('O elige tu zona').selectOption({ label: 'Barrio Santa Rosa' });
    await page.getByRole('button', { name: 'Publicar material' }).click();
    await expect(page.getByRole('dialog', { name: 'Tu material ya está publicado' })).toBeVisible();

    const contexto = await browser.newContext();
    const ruben = await contexto.newPage();
    await simularGoogleMaps(ruben);
    await entrarComo(ruben, RUBEN, /\/comprador$/);
    await ruben.goto('/negocio/publicaciones');
    await ruben.getByRole('group', { name: 'Material' }).getByRole('button', { name: 'Cartón' }).click();
    const tarjeta = ruben.locator('[data-cercana]').filter({ hasText: titulo });
    await tarjeta.getByRole('button', { name: 'Hacer oferta' }).click();
    const dialogo = ruben.getByRole('dialog', { name: titulo });
    await dialogo.getByLabel('Tu precio por kilo').fill('0.70');
    await dialogo.getByRole('button', { name: 'Enviar oferta' }).click();
    await expect(tarjeta).toContainText('Oferta enviada');
    await contexto.close();
  });

  test('el reciclador acepta y define el punto de encuentro sin compartir su ubicación (25)', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/ofertas');
    await page.getByRole('button', { name: new RegExp(titulo) }).click();
    const oferta = page.locator('[data-oferta]').filter({ hasText: 'Compras Rubén' });
    await oferta.getByRole('button', { name: 'Aceptar oferta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, aceptar oferta' }).click();
    await expect(page).toHaveURL(/\/operaciones\/[0-9a-f-]+$/);
    operacion = page.url().split('/operaciones/')[1]!;

    await page.getByRole('link', { name: 'Definir el punto de encuentro' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Compras Rubén');
    await expect(page.getByText('Tu ubicación no se comparte')).toBeVisible();
    await expect(page.getByText('En el local del centro')).toHaveCount(0);
    await expect(page.getByText(/ubicación exacta/i)).toHaveCount(0);
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Enviar punto de encuentro' }).click();
    await expect(page.getByText('Escribe una referencia', { exact: false })).toBeVisible();
    await page.getByLabel('Referencia del punto de encuentro').fill('Frente al mercado Santa Bárbara, puerta 2');
    await page.getByRole('group', { name: 'Día' }).getByRole('button', { name: 'Mañana', exact: true }).click();
    await page.getByRole('button', { name: 'Enviar punto de encuentro' }).click();

    await expect(page).toHaveURL(new RegExp(`/operaciones/${operacion}$`));
    await expect(page.locator('[data-panel="punto"]')).toContainText('Frente al mercado Santa Bárbara');
    await expect(page.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'EN_COORDINACION');
    await page.getByRole('button', { name: 'Ya entregué el material' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, ya entregué' }).click();
    await expect(page.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'ENTREGADA');
    await expect(page.getByRole('button', { name: 'Ya entregué el material' })).toHaveCount(0);
    await sinDesbordeHorizontal(page);
  });

  test('el comprador confirma la recepción con los kilos y ve el monto informativo (54)', async ({ page }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto('/notificaciones');
    await expect(page.getByText(/Cartón/).first()).toBeVisible();
    await page.getByRole('group', { name: 'Mostrar' }).getByRole('button', { name: 'Operaciones' }).click();
    await expect(page.locator('[data-notificacion]').first()).toBeVisible();

    await page.goto('/comprador/compras');
    const fila = page.locator(`[data-operacion="${operacion}"]`);
    await expect(fila).toContainText('Entregada');
    await sinDesbordeHorizontal(page);
    await fila.getByRole('button', { name: 'Confirmar recepción' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: 'Sí, lo recibí' }).click();
    await expect(dialogo.getByLabel('Kilos recibidos')).toHaveAttribute('aria-invalid', 'true');
    await dialogo.getByLabel('Kilos recibidos').fill(String(kg - 5));
    await expect(dialogo.locator('[data-monto]')).toContainText(((kg - 5) * 0.7).toFixed(2));
    await dialogo.getByRole('button', { name: 'Sí, lo recibí' }).click();
    await expect(fila).toContainText(`Kilos recibidos: ${kg - 5} kg`);
  });

  test('el reciclador no está conforme y el administrador pide corregir sin escribir kilos', async ({
    page,
    browser,
  }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto(`/operaciones/${operacion}`);
    await expect(page.getByText(`${kg - 5} kg`).first()).toBeVisible();
    await page.getByRole('button', { name: 'No conforme', exact: true }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('textbox').fill('Pesamos juntos y eran más kilos.');
    await dialogo.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Incidencia por los kilos confirmados')).toBeVisible();

    const contexto = await browser.newContext();
    const admin = await contexto.newPage();
    await entrarComoAdmin(admin);
    await admin.goto('/admin/incidencias');
    const incidencia = admin
      .locator('[data-incidencia]')
      .filter({ hasText: 'Compras Rubén' })
      .filter({ hasText: `${kg - 5} kg` });
    await expect(incidencia).toBeVisible();
    await expect(admin.getByRole('textbox', { name: /kilos/i })).toHaveCount(0);
    await sinDesbordeHorizontal(admin);
    await incidencia.getByRole('button', { name: 'Pedir corrección de kilos' }).click();
    await admin.getByLabel('Motivo de la decisión').fill('Ambas partes deben volver a pesar.');
    await admin.getByRole('button', { name: 'Confirmar decisión' }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await expect(incidencia).toContainText('Corrección pedida');
    await expect(incidencia.getByRole('button', { name: 'Pedir corrección de kilos' })).toHaveCount(0);
    await expect(incidencia.getByRole('button', { name: 'Anular sin puntos' })).toBeVisible();
    await contexto.close();
  });

  test('el comprador corrige, el reciclador da conformidad y suma puntos una vez', async ({ page, browser }) => {
    await entrarComo(page, RUBEN, /\/comprador$/);
    await page.goto(`/operaciones/${operacion}`);
    await page.getByRole('button', { name: 'Corregir los kilos recibidos' }).click();
    await page.getByRole('dialog').getByLabel('Kilos recibidos').fill(String(kg));
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar kilos corregidos' }).click();
    await expect(page.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'CONFIRMADA');

    const contexto = await browser.newContext();
    const marco = await contexto.newPage();
    await simularGoogleMaps(marco);
    await entrarComo(marco, MARCO, /\/mapa$/);
    await marco.goto(`/operaciones/${operacion}`);
    await marco.getByRole('button', { name: 'Conforme', exact: true }).click();
    await expect(marco.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'COMPLETADA');
    await expect(marco.getByText(`+${kg}`).first()).toBeVisible();

    await marco.goto('/historial');
    const fila = marco.locator(`[data-operacion="${operacion}"]`);
    await expect(fila).toContainText('Completada');
    await expect(fila).toContainText(`+${kg}`);
    await sinDesbordeHorizontal(marco);
    await contexto.close();
  });

  test('ambos califican; la reseña del reciclador es pública y el negocio responde una vez (27, 48, 17)', async ({
    page,
    browser,
  }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto(`/operaciones/${operacion}/calificar`);
    await expect(page.getByText(/será pública en la ficha de Compras Rubén/)).toBeVisible();
    await page.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(page.getByText('Elige de 1 a 5 estrellas.')).toBeVisible();
    await page.getByRole('radio', { name: '5 estrellas' }).click();
    await page.getByRole('button', { name: 'Puntual' }).click();
    await page.getByLabel(/Comentario/).fill(`Pagó lo acordado por ${kg} kg`);
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(page).toHaveURL(new RegExp(`/operaciones/${operacion}$`));
    await expect(page.getByText('Ya calificaste esta operación con 5 estrellas.')).toBeVisible();
    await page.goto(`/operaciones/${operacion}/calificar`);
    await expect(page.getByText('Ya calificaste esta operación')).toBeVisible();

    const contexto = await browser.newContext();
    const ruben = await contexto.newPage();
    await entrarComo(ruben, RUBEN, /\/comprador$/);
    await ruben.goto(`/operaciones/${operacion}/calificar`);
    await expect(ruben.getByText(/solo los centros y compradores/)).toBeVisible();
    await ruben.getByRole('radio', { name: '4 estrellas' }).click();
    await ruben.getByRole('button', { name: 'Material limpio' }).click();
    await ruben.getByRole('button', { name: 'Enviar calificación' }).click();
    await expect(ruben.getByText('Ya calificaste esta operación con 4 estrellas.')).toBeVisible();

    await ruben.goto('/negocio/resenas');
    const resena = ruben.locator('[data-resena]').filter({ hasText: `Pagó lo acordado por ${kg} kg` });
    await expect(resena.locator('[data-autor]')).toHaveText('Marco Q.');
    await resena.getByRole('button', { name: 'Responder' }).click();
    await ruben.getByLabel('Tu respuesta').fill('Gracias, Marco. Hasta la próxima.');
    await ruben.getByRole('button', { name: 'Publicar respuesta' }).click();
    await expect(resena.locator('[data-respuesta]')).toContainText('Gracias, Marco');
    await expect(resena.getByRole('button', { name: 'Responder' })).toHaveCount(0);
    await sinDesbordeHorizontal(ruben);
    await contexto.close();

    await page.goto(`/operaciones/${operacion}`);
    await page.getByRole('link', { name: 'Ver sus reseñas' }).click();
    const publica = page.locator('[data-resena]').filter({ hasText: `Pagó lo acordado por ${kg} kg` });
    await expect(publica.locator('[data-autor]')).toHaveText('Marco Q.');
    await expect(publica.locator('[data-respuesta]')).toContainText('Respuesta de Compras Rubén');
    await expect(page.getByRole('button', { name: 'Enviar calificación' })).toHaveCount(0);
    await sinDesbordeHorizontal(page);
  });
});

test('las reseñas públicas de un negocio muestran el promedio de operaciones reales (17, D2)', async ({ page }) => {
  await entrarComo(page, TITICACA, /\/negocio$/);
  await page.goto('/negocio/resenas');
  await expect(page.locator('[data-promedio]')).toHaveText(/^\d\.\d$/);
  await expect(page.locator('[data-resena]').first().locator('[data-autor]')).toHaveText(/^\S+ [A-ZÁÉÍÓÚÑ]\.$/);
  await sinDesbordeHorizontal(page);
});
