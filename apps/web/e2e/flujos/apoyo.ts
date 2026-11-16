import path from 'node:path';
import { expect, type Page } from '@playwright/test';

const MAPA_SIMULADO = path.join(import.meta.dirname, 'archivos', 'google-maps-simulado.js');

// Las pruebas nunca llaman a Google: el script del mapa se reemplaza por un sustituto local
export async function simularGoogleMaps(page: Page): Promise<void> {
  await page.route('https://maps.googleapis.com/**', (ruta) =>
    ruta.fulfill({ path: MAPA_SIMULADO, contentType: 'text/javascript' }),
  );
}

// Inicia sesión con teléfono y contraseña (cuentas sin segundo factor)
export async function ingresar(page: Page, telefono: string, clave: string): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo o teléfono').fill(telefono);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

export const CLAVE = 'Prueba2026!';
export const CLAVE_SEMILLA = process.env.SEMILLA_CLAVE ?? 'Prueba2026!';
export const ADMIN = '900000099';

export function telefonoNuevo(): string {
  return `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

// La API de pruebas devuelve el código del SMS simulado en la respuesta
export async function codigoDe(page: Page, ruta: string, accion: () => Promise<void>): Promise<string> {
  const [respuesta] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(ruta) && r.request().method() === 'POST'),
    accion(),
  ]);
  const cuerpo = (await respuesta.json()) as { codigoDePrueba?: string };
  expect(cuerpo.codigoDePrueba).toMatch(/^\d{6}$/);
  return cuerpo.codigoDePrueba!;
}

export async function escribirCodigo(page: Page, codigo: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Dígito 1' }).fill(codigo);
}

// Abre una pestaña de la barra: en el celular primero hay que abrir el menú
export async function abrirPestana(page: Page, nombre: string): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menú' });
  if (await menu.isVisible()) {
    await menu.click();
    await page.locator('#menu-movil').getByRole('link', { name: nombre, exact: true }).click();
    return;
  }
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: nombre, exact: true }).click();
}

export async function sinDesbordeHorizontal(page: Page): Promise<void> {
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desborde).toBeLessThanOrEqual(1);
}
