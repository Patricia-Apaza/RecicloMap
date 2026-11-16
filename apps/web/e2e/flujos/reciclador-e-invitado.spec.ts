import { expect, test } from '@playwright/test';
import {
  abrirPestana,
  CLAVE,
  codigoDe,
  escribirCodigo,
  simularGoogleMaps,
  sinDesbordeHorizontal,
  telefonoNuevo,
} from './apoyo';

test.beforeEach(async ({ page }) => {
  await simularGoogleMaps(page);
});

test('registro del reciclador hasta el mapa provisional, con la insignia Semilla', async ({ page }) => {
  const telefono = telefonoNuevo();
  await page.goto('/');
  await page.getByRole('link', { name: 'Soy reciclador' }).click();
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
  await sinDesbordeHorizontal(page);

  // Validación del prototipo antes de llamar a la API
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Escribe tu nombre y apellido.')).toBeVisible();
  await expect(page.getByText('Debes aceptar para continuar.')).toBeVisible();

  await page.getByLabel('Nombre completo').fill('Rosa Mamani Quispe');
  await page.getByLabel('Teléfono (WhatsApp)').fill(telefono);
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
  await page.getByRole('checkbox').check();
  const codigo = await codigoDe(page, '/auth/registro/reciclador', () =>
    page.getByRole('button', { name: 'Continuar' }).click(),
  );

  await expect(page).toHaveURL(/\/verificar-telefono$/);
  await expect(page.getByRole('heading', { name: 'Verifica tu teléfono' })).toBeVisible();
  await expect(page.getByText(`••• ••• ${telefono.slice(-3)}`)).toBeVisible();
  await expect(page.getByRole('button', { name: /Reenviar código en \d+ s/ })).toBeDisabled();
  await escribirCodigo(page, '000000');
  await page.getByRole('button', { name: 'Verificar teléfono' }).click();
  await expect(page.getByText('El código no es correcto')).toBeVisible();
  await escribirCodigo(page, codigo);
  await page.getByRole('button', { name: 'Verificar teléfono' }).click();

  await expect(page).toHaveURL(/\/registro\/materiales$/);
  await expect(page.getByRole('button', { name: 'Finalizar registro' })).toBeDisabled();
  await page.getByLabel('PET').check();
  await page.getByLabel('Plástico duro').check();
  await expect(page.getByText('Elegiste 2 materiales: PET, Plástico duro.')).toBeVisible();
  await sinDesbordeHorizontal(page);
  await page.getByRole('button', { name: 'Finalizar registro' }).click();

  const ventana = page.getByRole('dialog', { name: '¡Bienvenido a RecicloMap!' });
  await expect(ventana.getByText('Semilla', { exact: true })).toBeVisible();
  await ventana.getByRole('button', { name: 'Ir al mapa' }).click();

  await expect(page).toHaveURL(/\/mapa$/);
  await expect(page.getByRole('heading', { name: /Quién compra/ })).toBeVisible();
  await expect(
    page.getByText('Usamos tu ubicación solo para calcular distancias; nunca se muestra a nadie.'),
  ).toBeVisible();
  await expect(page.getByText('Estás viendo como invitado')).toHaveCount(0);
  await sinDesbordeHorizontal(page);
});

test('el invitado mira el mapa y, al intentar publicar, se le invita a registrarse', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar como invitado' }).first().click();
  await expect(page).toHaveURL(/\/mapa$/);
  await expect(page.getByText('Estás viendo como invitado.')).toBeVisible();
  await sinDesbordeHorizontal(page);

  await abrirPestana(page, 'Publicar');
  const ventana = page.getByRole('dialog', { name: 'Crea tu cuenta gratis' });
  await expect(ventana.getByText(/Para publicar tu material necesitas una cuenta/)).toBeVisible();
  await expect(page).toHaveURL(/\/mapa$/);
  await ventana.getByRole('button', { name: 'Seguir mirando como invitado' }).click();
  await expect(ventana).toBeHidden();

  await abrirPestana(page, 'Puntos');
  await page
    .getByRole('dialog', { name: 'Crea tu cuenta gratis' })
    .getByRole('link', { name: 'Crear cuenta de reciclador' })
    .click();
  await expect(page).toHaveURL(/\/registro\/reciclador$/);
});

test('sin modo invitado ni sesión, el mapa pide iniciar sesión', async ({ page }) => {
  await page.goto('/mapa');
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fmapa$/);
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
});
