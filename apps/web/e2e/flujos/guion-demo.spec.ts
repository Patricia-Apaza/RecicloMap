import { writeFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import {
  ADMIN,
  CLAVE_SEMILLA,
  codigoDe,
  escribirCodigo,
  ingresar,
  simularGoogleMaps,
  sinDesbordeHorizontal,
} from './apoyo';

const MARCO = '900000001';
const RUBEN = '900000021';

// Lo que vería un túnel: cada solicitud al propio sitio (también las de la API y los archivos estáticos) cuenta
const solicitudes: Record<string, number> = {};
function contar(contexto: BrowserContext, origen: string): void {
  contexto.on('request', (peticion) => {
    const url = new URL(peticion.url());
    if (url.origin !== origen) return;
    const clase = url.pathname.startsWith('/api/v1/en-vivo')
      ? 'avisos en vivo'
      : url.pathname.startsWith('/api/v1/')
        ? 'API'
        : url.pathname.startsWith('/_next/static') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png')
          ? 'archivos estáticos'
          : url.searchParams.has('_rsc')
            ? 'precarga de pantallas'
            : peticion.resourceType() === 'document'
              ? 'páginas'
              : 'otras';
    solicitudes[clase] = (solicitudes[clase] ?? 0) + 1;
  });
}

async function entrarComo(page: Page, telefono: string, destino: RegExp): Promise<void> {
  await simularGoogleMaps(page);
  await ingresar(page, telefono, CLAVE_SEMILLA);
  await expect(page).toHaveURL(destino);
  // Con los avisos en vivo siempre hay un sondeo abierto: la red nunca queda en reposo, así que se espera a que cargue y se renueve la sesión
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
}

// Sigue el guion de la demostración (docs/guion-demo.md) paso a paso con las cuentas de la semilla
test('guion de la demostración: del material publicado al panel de la administración', async ({ browser, page }) => {
  test.setTimeout(180_000);
  for (const clave of Object.keys(solicitudes)) delete solicitudes[clave];
  const kg = 150 + (Date.now() % 700);
  const titulo = `Cartón · ${kg} kg`;

  contar(page.context(), new URL(test.info().project.use.baseURL!).origin);
  // Ventana normal: Marco, reciclador
  await entrarComo(page, MARCO, /\/mapa$/);

  // 1. Publicar
  await page.goto('/publicar');
  await page.getByRole('group', { name: '1. ¿Qué material es?' }).getByRole('button', { name: 'Cartón' }).click();
  await page.getByLabel('2. Kilos aproximados').fill(String(kg));
  await page.getByLabel(/Precio que esperas/).fill('0,60');
  await page.getByLabel('O elige tu zona').selectOption({ label: 'Barrio Santa Rosa' });
  await page.getByRole('button', { name: 'Publicar material' }).click();
  await expect(page.getByRole('dialog', { name: 'Tu material ya está publicado' })).toBeVisible();

  // 2. Ofertar: ventana privada, Compras Rubén, comprador móvil
  const privada = await browser.newContext();
  contar(privada, new URL(test.info().project.use.baseURL!).origin);
  const ruben = await privada.newPage();
  await entrarComo(ruben, RUBEN, /\/comprador$/);
  await ruben.goto('/negocio/publicaciones');
  await ruben.getByRole('group', { name: 'Material' }).getByRole('button', { name: 'Cartón' }).click();
  const tarjeta = ruben.locator('[data-cercana]').filter({ hasText: titulo });
  await tarjeta.getByRole('button', { name: 'Hacer oferta' }).click();
  const oferta = ruben.getByRole('dialog', { name: titulo });
  await oferta.getByLabel('Tu precio por kilo').fill('0.70');
  await oferta.getByRole('button', { name: 'Enviar oferta' }).click();
  await expect(tarjeta).toContainText('Oferta enviada');
  // El aviso llega a Marco en vivo, sin recargar, por el mismo origen (sondeo largo a través de la web)
  await expect(page.getByText('Nueva oferta por tu Cartón').first()).toBeVisible({ timeout: 15_000 });

  // 3. Aceptar
  await page.goto('/ofertas');
  await page.getByRole('button', { name: new RegExp(titulo) }).click();
  await page
    .locator('[data-oferta]')
    .filter({ hasText: 'Compras Rubén' })
    .getByRole('button', { name: 'Aceptar oferta' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, aceptar oferta' }).click();
  await expect(page).toHaveURL(/\/operaciones\/[0-9a-f-]+$/);
  const operacion = page.url().split('/operaciones/')[1]!;

  // 4. Coordinar
  await page.getByRole('link', { name: 'Definir el punto de encuentro' }).click();
  await page.getByLabel('Referencia del punto de encuentro').fill('Frente al mercado Santa Bárbara, puerta 2');
  await page.getByRole('group', { name: 'Día' }).getByRole('button', { name: 'Mañana', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar punto de encuentro' }).click();
  await expect(page.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'EN_COORDINACION');

  // 5. Entregar
  await page.getByRole('button', { name: 'Ya entregué el material' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, ya entregué' }).click();
  await expect(page.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'ENTREGADA');

  // 6. Confirmar: el comprador confirma los kilos recibidos
  await ruben.goto('/comprador/compras');
  const fila = ruben.locator(`[data-operacion="${operacion}"]`);
  await fila.getByRole('button', { name: 'Confirmar recepción' }).click();
  const confirmacion = ruben.getByRole('dialog');
  await confirmacion.getByLabel('Kilos recibidos').fill(String(kg));
  await confirmacion.getByRole('button', { name: 'Sí, lo recibí' }).click();
  await expect(fila).toContainText(`Kilos recibidos: ${kg} kg`);

  // Conformidad del reciclador y puntos
  await page.goto(`/operaciones/${operacion}`);
  await page.getByRole('button', { name: 'Conforme', exact: true }).click();
  await expect(page.locator('[data-estado]').first()).toHaveAttribute('data-estado', 'COMPLETADA');
  await expect(page.getByText(`+${kg}`).first()).toBeVisible();

  // 7. Calificar en ambos sentidos
  await page.goto(`/operaciones/${operacion}/calificar`);
  await page.getByRole('radio', { name: '5 estrellas' }).click();
  await page.getByRole('button', { name: 'Puntual' }).click();
  await page.getByLabel(/Comentario/).fill(`Pagó lo acordado por ${kg} kg`);
  await page.getByRole('button', { name: 'Enviar calificación' }).click();
  await expect(page.getByText('Ya calificaste esta operación con 5 estrellas.')).toBeVisible();
  await ruben.goto(`/operaciones/${operacion}/calificar`);
  await ruben.getByRole('radio', { name: '4 estrellas' }).click();
  await ruben.getByRole('button', { name: 'Material limpio' }).click();
  await ruben.getByRole('button', { name: 'Enviar calificación' }).click();
  await expect(ruben.getByText('Ya calificaste esta operación con 4 estrellas.')).toBeVisible();

  // 8. Puntos: el historial suma lo de la entrega
  await page.goto('/puntos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/historial');
  await expect(page.locator(`[data-operacion="${operacion}"]`)).toContainText(`+${kg}`);

  // 9. Ruleta: la Meta del mes da un giro; si ya se usó en otra corrida, solo se comprueba la pantalla
  await page.goto('/puntos/desafios');
  const meta = page.locator('[data-desafio]').filter({ hasText: 'Recicla 100 kg este mes' });
  if ((await meta.getAttribute('data-estado')) === 'COMPLETADO') {
    await meta.getByRole('button', { name: /Reclamar/ }).click();
    await expect(page.getByText('+30 puntos de bono y 1 giro de la ruleta')).toBeVisible();
  }
  await page.goto('/puntos/ruleta');
  await expect(page.locator('[data-rueda]')).toBeVisible();
  const giros = Number(await page.locator('[data-giros]').getAttribute('data-giros'));
  if (giros >= 1) {
    await page.locator('[data-girar]').click();
    const resultado = page.getByRole('dialog');
    await expect(resultado.locator('[data-resultado]')).toContainText(
      /puntos de bono|Reclámalo|Esta vez no hubo premio/,
      { timeout: 15_000 },
    );
    await resultado.getByRole('button', { name: 'Genial' }).click();
  }

  // 10. Panel de la administración
  await privada.close();
  const otra = await browser.newContext();
  contar(otra, new URL(test.info().project.use.baseURL!).origin);
  const admin = await otra.newPage();
  await simularGoogleMaps(admin);
  await admin.goto('/ingresar');
  await admin.getByLabel('Correo o teléfono').fill(ADMIN);
  await admin.getByLabel('Contraseña', { exact: true }).fill(CLAVE_SEMILLA);
  const codigo = await codigoDe(admin, '/auth/login', () => admin.getByRole('button', { name: 'Ingresar' }).click());
  await escribirCodigo(admin, codigo);
  await admin.getByRole('button', { name: 'Entrar' }).click();
  await expect(admin).toHaveURL(/\/admin/);
  await expect(admin.locator('[data-panel="pendientes"]')).toBeVisible();
  await expect(admin.locator('[data-panel="operaciones"]')).toBeVisible();
  await sinDesbordeHorizontal(admin);
  await admin.goto('/admin/auditoria');
  await expect(admin.getByRole('heading', { level: 1 })).toBeVisible();
  await otra.close();
  const total = Object.values(solicitudes).reduce((a, b) => a + b, 0);
  const detalle = Object.entries(solicitudes)
    .sort((a, b) => b[1] - a[1])
    .map(([clase, n]) => `${clase}: ${n}`)
    .join('\n');
  writeFileSync(`test-results/solicitudes-guion-${test.info().project.name}.txt`, `total: ${total}\n${detalle}\n`);
  console.log(`SOLICITUDES_DEL_GUION ${test.info().project.name} total ${total}\n${detalle}`);
});
