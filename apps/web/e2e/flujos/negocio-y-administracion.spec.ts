import path from 'node:path';
import { expect, test } from '@playwright/test';
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
} from './apoyo';

const FOTO = path.join(import.meta.dirname, 'archivos', 'local.jpg');

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

test.describe.serial('centro de acopio: registro, revisión y aprobación', () => {
  // Datos nuevos en cada proyecto (celular y escritorio), que comparten la base
  let telefono = '';
  let nombre = '';
  test.beforeAll(() => {
    telefono = telefonoNuevo();
    nombre = `Acopio Prueba ${telefono.slice(-4)}`;
  });

  test('se registra en 6 pasos y queda "En revisión"', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Soy centro de acopio' }).click();
    await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible();
    await expect(page.getByText('Paso 1 de 6')).toBeVisible();

    await page.getByLabel('Teléfono').fill(telefono);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByRole('checkbox').check();
    const codigo = await codigoDe(page, '/auth/registro/negocio', () =>
      page.getByRole('button', { name: 'Continuar' }).click(),
    );
    await escribirCodigo(page, codigo);
    await page.getByRole('button', { name: 'Verificar teléfono' }).click();

    await expect(page.getByRole('heading', { name: 'Datos del negocio' })).toBeVisible();
    await expect(page.getByText('Paso 2 de 6')).toBeVisible();
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Escribe el nombre del negocio.')).toBeVisible();
    await page.getByLabel('Nombre del centro').fill(nombre);
    await page.getByLabel('Dirección').fill('Jr. Moquegua 123, Juliaca');
    await page.getByLabel('Teléfono', { exact: true }).fill(telefono);
    await page.getByLabel('WhatsApp').fill(telefono);
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByRole('heading', { name: 'Ubicación en el mapa' })).toBeVisible();
    await page.getByLabel('Zona del local').selectOption({ label: 'Centro de Juliaca' });
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Coloca el pin de tu local en el mapa.')).toBeVisible();
    const lienzo = page.getByRole('application', { name: /colocar el pin de tu local/ });
    await lienzo.click({ position: { x: 20, y: 20 } });
    await expect(lienzo).toHaveAttribute('data-pin', /^-15\.\d+,-70\.\d+$/);
    await expect(page.getByText('Pin colocado. Puedes arrastrarlo para corregirlo.')).toBeVisible();
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByRole('heading', { name: 'Horario de atención' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByRole('heading', { name: 'Materiales, precios y demanda' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'PET' }).check();
    await page.getByLabel('Precio mínimo de PET').fill('0.80');
    await page.getByLabel('Precio máximo de PET').fill('1.20');
    await page.getByLabel('Demanda de PET').selectOption('ALTA');
    await page.getByRole('checkbox', { name: 'Papel' }).check();
    await page.getByLabel('Precio máximo de Papel').fill('0.40');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Falta el precio mínimo de Papel.')).toBeVisible();
    await page.getByLabel('Precio mínimo de Papel').fill('0.30');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByRole('heading', { name: 'Fotos y métodos de pago' })).toBeVisible();
    await page.getByLabel('Subir foto del local').setInputFiles(FOTO);
    await expect(page.getByRole('img', { name: 'Foto del negocio' })).toBeVisible();
    await page.getByRole('button', { name: 'Yape' }).click();
    await sinDesbordeHorizontal(page);
    await page.getByRole('button', { name: 'Enviar para verificación' }).click();

    await expect(page).toHaveURL(/\/verificacion$/);
    await expect(page.getByRole('heading', { name: 'Estamos revisando tu perfil' })).toBeVisible();
    await expect(page.getByText(/en la app y por SMS/)).toBeVisible();
    await expect(page.getByText(nombre)).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test('la administración entra con su código, ve las fotos y aprueba', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo o teléfono').fill(ADMIN);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE_SEMILLA);
    const codigo = await codigoDe(page, '/auth/login', () => page.getByRole('button', { name: 'Ingresar' }).click());
    await expect(page.getByRole('heading', { name: 'Código de administración' })).toBeVisible();
    await escribirCodigo(page, codigo);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/admin\/verificaciones$/);
    await expect(page.getByRole('button', { name: /Acopio Los Pinos/ })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(nombre) }).click();
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible();
    await expect(page.getByText('solo lectura')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver foto en grande' })).toBeVisible();
    await sinDesbordeHorizontal(page);

    await page.getByRole('button', { name: 'Rechazar con motivo' }).click();
    const ventana = page.getByRole('dialog', { name: `Rechazar a ${nombre}` });
    await ventana.getByRole('button', { name: 'Confirmar' }).click();
    await expect(ventana.getByText('Elige un motivo.')).toBeVisible();
    await ventana.getByRole('button', { name: 'Volver' }).click();

    await page.getByRole('button', { name: 'Aprobar y mostrar en el mapa' }).click();
    await expect(page.getByRole('status').filter({ hasText: `${nombre} aprobado` })).toBeVisible();
    await page.getByRole('button', { name: /^Resueltas/ }).click();
    await expect(page.getByRole('button', { name: new RegExp(nombre) })).toContainText('Aprobado');
  });

  test('el centro ve su perfil "Verificado"', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Correo o teléfono').fill(telefono);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/negocio$/);
    await page.goto('/verificacion');
    await expect(page.getByRole('heading', { name: '¡Tu perfil está verificado!' })).toBeVisible();
    await page.getByRole('link', { name: 'Ir a mi panel' }).click();
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
    // Negocio nuevo: sin cifras inventadas
    await expect(page.getByText('Aún sin kilos recibidos')).toBeVisible();
    // Registrado con pin: no se le pide colocarlo
    await expect(page.getByText('Coloca el pin de tu local.')).toHaveCount(0);
    await page.getByRole('link', { name: 'Actualizar precios' }).click();
    await expect(page).toHaveURL(/\/negocio\/precios$/);
    await expect(page.locator('[data-panel="pin"]')).toHaveCount(0);
  });
});

test('el centro actualiza su rango y demanda en la 43 y ve su semáforo sin nombres ajenos', async ({ page }) => {
  await ingresar(page, '900000011', CLAVE_SEMILLA);
  await expect(page).toHaveURL(/\/negocio$/);
  await page.goto('/negocio/precios');
  await expect(page.getByRole('heading', { name: /Tu precio/ })).toBeVisible();
  const vista = page.locator('[data-panel="vista"]');
  await expect(vista.locator('[data-semaforo]').first()).toBeVisible();
  for (const ajeno of ['EcoAcopio Juliaca', 'Acopio Los Pinos']) await expect(page.getByText(ajeno)).toHaveCount(0);
  await expect(page.getByText(/el administrador puede marcarlos como sospechosos, pero no editarlos/i)).toBeVisible();
  await sinDesbordeHorizontal(page);

  const carton = page.locator('[data-material="carton"]');
  await carton.getByLabel('Desde').fill('0.90');
  await carton.getByLabel('Hasta').fill('0.60');
  await carton.getByLabel('Hasta').blur();
  await expect(carton.getByText('El “hasta” no puede ser menor que el “desde”.')).toBeVisible();
  await carton.getByLabel('Hasta').fill('0.95');
  await carton.getByRole('button', { name: 'Alta' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Precios guardados. Actualizados hoy.' })).toBeVisible();
  await expect(carton.getByText(/^Actualizado (ahora|hace \d+ min)$/)).toBeVisible();
  await expect(page.locator('[data-panel="historial"]')).toContainText(/0\.90–0\.95/);
  await expect(vista).toContainText(/Cartón\s*S\/\s*0\.90–0\.95.*?Demanda alta/);
});

test('recuperar la contraseña no usa un código fijo y responde igual sin cuenta', async ({ page }) => {
  await page.goto('/recuperar');
  await page.getByLabel('Correo o teléfono').fill('911999999');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByRole('heading', { name: 'Ingresa el código' })).toBeVisible();
  await expect(page.getByText('123456')).toHaveCount(0);
  await escribirCodigo(page, '123456');
  await page.getByRole('button', { name: 'Verificar código' }).click();
  await expect(page.getByText(/El código venció o no existe/)).toBeVisible();
});

test('sin rastros del prototipo en las pantallas de acceso', async ({ page }) => {
  for (const ruta of ['/', '/ingresar', '/registro/reciclador', '/recuperar', '/registro/comprador']) {
    await page.goto(ruta);
    await expect(page.getByText(/Modo prototipo|Ver como…|prototipo/i)).toHaveCount(0);
  }
});
