import { expect, type Page, test } from '@playwright/test';
import { CLAVE_SEMILLA, ingresar, simularGoogleMaps, sinDesbordeHorizontal, esperarRed } from './apoyo';

const MARCO = '900000001';
const TITICACA = '900000011';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

async function entrarComo(page: Page, telefono: string, destino: RegExp): Promise<void> {
  await ingresar(page, telefono, CLAVE_SEMILLA);
  await expect(page).toHaveURL(destino);
  await esperarRed(page);
}

test.describe.serial('puntos, niveles, insignias, desafíos, ranking y entrega directa (14, 30, 31, 33, 36, 37)', () => {
  test('puntos: saldo, nivel, giros y movimientos del servidor', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos');
    await expect(page.getByRole('heading', { name: /Cada kilo/ })).toBeVisible();
    await expect(page.locator('[data-kpis]')).toContainText(/Semilla|Brote|Recolector|Guardián|Maestro|Leyenda/);
    await expect(page.locator('[data-kpis]')).toContainText('Puntos');
    await expect(page.locator('[data-panel="historial"]')).toContainText('Operación completada');
    await expect(page.locator('[data-codigo]')).toHaveText('RECI-MQ48');
    await expect(page.locator('[data-panel="niveles"] [style*="opacity"]')).toHaveCount(6);
    await expect(page.locator('[data-kpis]')).toContainText('Giros');
    await expect(page.locator('[data-kpis]')).toContainText(/Próximo giro en \d+ pts/);
    await expect(page.getByRole('link', { name: 'Ir a la ruleta' })).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('niveles: escalera de 6 niveles con "Estás aquí" y los kilos de las últimas 8 semanas', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/niveles');
    await expect(page.getByRole('heading', { name: /Tus niveles/ })).toBeVisible();
    await expect(page.locator('[data-nivel]')).toHaveCount(6);
    // Los dos proyectos comparten la base: el nivel puede haber subido por una entrega directa
    await expect(page.locator('[data-nivel]').filter({ hasText: 'Estás aquí' })).toHaveCount(1);
    await expect(page.locator('[data-nivel="6"]')).toContainText(/2[.,]500 kg acumulados/);
    await expect(page.locator('[data-panel="semanas"] svg')).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('insignias: las 12 con su progreso, y el detalle se abre con su criterio', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/insignias');
    await expect(page.locator('[data-insignia]')).toHaveCount(12);
    await expect(page.locator('[data-contador]')).toContainText('/ 12 logradas');
    await expect(page.locator('[data-insignia="recolector"]')).toHaveAttribute('data-lograda', 'true');
    await page.locator('[data-insignia="cazador_de_precios"]').click();
    const detalle = page.getByRole('dialog');
    await expect(detalle).toContainText('Acepta 5 veces la oferta de mayor total');
    await expect(detalle).toContainText('Progreso');
    await sinDesbordeHorizontal(page);
    await detalle.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('perfil: nivel, kilos, insignias especiales e historial', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/perfil');
    await expect(page.getByRole('heading', { name: /Tu camino/ })).toBeVisible();
    await expect(page.locator('[data-perfil]')).toContainText(
      /Nivel [1-6] · (Semilla|Brote|Recolector|Guardián|Maestro|Leyenda)/,
    );
    await expect(page.locator('[data-especiales] [data-insignia]')).toHaveCount(4);
    await expect(page.locator('[data-especiales] [data-insignia="reciclador_confiable"]')).toHaveAttribute(
      'data-lograda',
      'true',
    );
    await expect(page.locator('[data-panel="historial"] tbody tr').first()).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('ranking: nombre abreviado y nivel; ocultarse te saca de la lista y se puede volver', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/ranking');
    await expect(page.getByRole('heading', { name: /Ranking de/ })).toBeVisible();
    await page.getByRole('group', { name: 'Alcance' }).getByRole('button', { name: 'Total' }).click();
    await expect(page.locator('[data-lista-ranking] [data-fila]').first()).toBeVisible();
    await expect(page.locator('[data-lista-ranking]')).toContainText('Marco Q.');
    await expect(page.locator('[data-lista-ranking]')).not.toContainText('Quispe');
    await expect(page.locator('[data-panel="posicion"]')).toContainText('#');
    await sinDesbordeHorizontal(page);

    const interruptor = page.getByRole('switch', { name: 'Aparecer en el ranking' });
    await interruptor.click();
    await expect(page.locator('[data-panel="posicion"]')).toContainText('Estás oculto del ranking');
    await expect(page.locator('[data-lista-ranking]')).not.toContainText('Marco Q.');
    await page.getByRole('switch', { name: 'Aparecer en el ranking' }).click();
    await expect(page.locator('[data-panel="posicion"]')).toContainText('#');
  });

  test('desafíos: los del mes con progreso real; la Meta del mes da un giro', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/desafios');
    await expect(page.getByRole('heading', { name: /Desafíos de/ })).toBeVisible();
    await expect(page.getByText(/Se renuevan en \d+ días?/)).toBeVisible();
    await expect(page.locator('[data-desafio]').filter({ hasText: 'Recicla 100 kg este mes' })).toContainText(
      'Meta del mes',
    );
    expect(await page.locator('[data-desafio]').count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('[data-desafio]').filter({ hasText: 'Recicla 100 kg este mes' })).toContainText(
      '+1 giro',
    );
    await sinDesbordeHorizontal(page);
  });

  test('entrega directa: se registra, el negocio confirma con los kilos que recibió y se suman puntos y kilos', async ({
    browser,
    page,
  }, info) => {
    // Los dos proyectos comparten la base: cada uno usa su propio material
    const movil = info.project.name === 'movil-360';
    const material = movil ? 'Papel' : 'Plástico duro';
    const kilos = movil ? 120 : 130;

    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/entregas');
    await expect(page.getByRole('heading', { name: /Entrega/ })).toBeVisible();
    await page.getByLabel('¿A qué negocio?').selectOption({ label: 'Acopio Titicaca · Centro de Juliaca' });
    await page.getByRole('group', { name: 'Material' }).getByRole('button', { name: material }).click();
    await page.getByLabel('Kilos entregados').fill('0');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByText(/entre 1 y 5 000/)).toBeVisible();
    await page.getByLabel('Kilos entregados').fill(String(kilos));
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    const fila = page.locator('[data-entrega][data-estado="PENDIENTE"]').filter({ hasText: material });
    await expect(fila.first()).toContainText('sin puntos hasta confirmarse');
    await sinDesbordeHorizontal(page);

    // El negocio confirma con los kilos que recibió
    const contexto = await browser.newContext({ baseURL: info.project.use.baseURL });
    const negocio = await contexto.newPage();
    await simularGoogleMaps(negocio);
    await entrarComo(negocio, TITICACA, /\/negocio$/);
    await negocio.goto('/negocio/entregas');
    const pendiente = negocio.locator('[data-entrega][data-estado="PENDIENTE"]').filter({ hasText: material }).first();
    await expect(pendiente).toContainText('Marco Q.');
    await expect(pendiente).not.toContainText('Quispe');
    await sinDesbordeHorizontal(negocio);
    await pendiente.getByRole('button', { name: 'Confirmar' }).click();
    const dialogo = negocio.getByRole('dialog');
    await expect(dialogo.getByLabel('Kilos recibidos')).toHaveValue(String(kilos));
    await dialogo.getByLabel('Kilos recibidos').fill(String(kilos - 10));
    await dialogo.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(negocio.getByText('Entrega confirmada')).toBeVisible();
    await contexto.close();

    // El reciclador ve los kilos confirmados por el negocio
    await page.goto('/puntos/entregas');
    const confirmada = page.locator('[data-entrega][data-estado="CONFIRMADO"]').filter({ hasText: material }).first();
    await expect(confirmada).toContainText(`${kilos - 10} kg`);
    await expect(confirmada).toContainText(`el negocio confirmó ${kilos - 10} kg`);
    await page.goto('/notificaciones');
    await expect(page.getByText('Confirmaron tu entrega directa').first()).toBeVisible();
  });

  test('desafíos: con los kilos confirmados se reclama la Meta del mes una sola vez', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/desafios');
    const meta = page.locator('[data-desafio]').filter({ hasText: 'Recicla 100 kg este mes' });
    // Si el otro proyecto ya la reclamó, queda en "Reclamado"
    if ((await meta.getAttribute('data-estado')) === 'COMPLETADO') {
      await meta.getByRole('button', { name: /Reclamar/ }).click();
      await expect(page.getByText('+30 puntos de bono y 1 giro de la ruleta')).toBeVisible();
    }
    await expect(meta).toHaveAttribute('data-estado', 'RECLAMADO');
    await expect(meta.getByRole('button', { name: /Reclamar/ })).toHaveCount(0);
    await sinDesbordeHorizontal(page);
  });

  test('ruleta: giros, avance, Meta del mes y premios con su probabilidad real; el giro lo decide el servidor', async ({
    page,
  }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/ruleta');
    await expect(page.getByRole('heading', { name: /Gira y/ })).toBeVisible();
    await expect(page.locator('[data-rueda]')).toBeVisible();
    await expect(page.locator('[data-premio]')).toHaveCount(8);
    const porcentajes = await page.locator('[data-probabilidad]').allTextContents();
    const suma = porcentajes.reduce((total, t) => total + Number(t.replace('%', '').replace(',', '.').trim()), 0);
    expect(suma).toBeCloseTo(100, 1);
    await expect(page.locator('[data-premio="Sigue intentando"]')).toBeVisible();
    await expect(page.locator('[data-aviso-segmentos]')).toContainText('no refleja la probabilidad');
    await expect(page.locator('[data-meta-mes]')).toContainText('Meta del mes');
    await expect(page.locator('[data-panel="avance"]')).toContainText(/de 500 puntos/);
    await sinDesbordeHorizontal(page);

    const giros = Number(await page.locator('[data-giros]').getAttribute('data-giros'));
    const girar = page.locator('[data-girar]');
    if (giros < 1) {
      // El otro proyecto ya gastó el giro de la Meta del mes
      await expect(girar).toBeDisabled();
      return;
    }
    await expect(girar).toBeEnabled();
    await girar.click();
    await expect(girar).toBeDisabled();
    const resultado = page.getByRole('dialog');
    await expect(resultado).toBeVisible({ timeout: 15_000 });
    await expect(resultado.locator('[data-resultado]')).toContainText(
      /puntos de bono|Reclámalo|Esta vez no hubo premio/,
    );
    await sinDesbordeHorizontal(page);
    await resultado.getByRole('button', { name: 'Genial' }).click();
    await expect(page.locator('[data-giros]')).toHaveAttribute('data-giros', String(giros - 1));
  });

  test('Mis premios: resumen, filtros y reclamo con código; la entrega no la marca el reciclador', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos/premios');
    await expect(page.getByRole('heading', { name: /Tus premios/ })).toBeVisible();
    await expect(page.locator('[data-kpis]')).toContainText('Ganados');
    await expect(page.locator('[data-kpis]')).toContainText('Por reclamar');
    await expect(page.getByRole('group', { name: 'Filtrar premios' })).toContainText('Entregados');
    await expect(page.getByRole('button', { name: 'Ya lo recogí' })).toHaveCount(0);
    await sinDesbordeHorizontal(page);
    const porReclamar = page.locator('[data-reclamar]').first();
    if (await porReclamar.count()) {
      await porReclamar.click();
      const dialogo = page.getByRole('dialog');
      await expect(dialogo).toContainText('Al reclamar te mostramos tu código');
      await dialogo.getByRole('button', { name: 'Reclamar premio' }).click();
      await expect(dialogo.locator('[data-codigo-premio]')).toContainText(/RM-[A-Z0-9]{4}/);
      await sinDesbordeHorizontal(page);
      await dialogo.getByRole('button', { name: 'Entendido' }).click();
      await expect(page.locator('[data-premio-ganado="RECLAMADO"]').first()).toBeVisible();
    }
    await page
      .getByRole('group', { name: 'Filtrar premios' })
      .getByRole('button', { name: /^Puntos/ })
      .click();
    await sinDesbordeHorizontal(page);
  });

  test('el menú Más de un reciclador incluye Ruleta y Mis premios', async ({ page }) => {
    await entrarComo(page, MARCO, /\/mapa$/);
    await page.goto('/puntos');
    await expect(page.locator('a[href="/puntos/ruleta"]').first()).toBeAttached();
    await expect(page.locator('a[href="/puntos/premios"]').first()).toBeAttached();
  });
});
