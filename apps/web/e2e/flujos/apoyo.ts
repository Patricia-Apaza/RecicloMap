import path from 'node:path';
import { expect, type Page, type Request } from '@playwright/test';

const MAPA_SIMULADO = path.join(import.meta.dirname, 'archivos', 'google-maps-simulado.js');

const TESELA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

// Las pruebas nunca llaman a servicios de mapas: las teselas y el script de Google se reemplazan por sustitutos locales
export async function simularGoogleMaps(page: Page): Promise<void> {
  await page.route('https://maps.googleapis.com/**', (ruta) =>
    ruta.fulfill({ path: MAPA_SIMULADO, contentType: 'text/javascript' }),
  );
  await page.route('https://tile.openstreetmap.org/**', (ruta) =>
    ruta.fulfill({ body: TESELA, contentType: 'image/png' }),
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

// Cuenta lista para usar, creada por la API para no repetir el registro en cada prueba
export async function crearRecicladorListo(page: Page): Promise<string> {
  const telefono = telefonoNuevo();
  const registro = await page.request.post('/api/v1/auth/registro/reciclador', {
    data: { nombre: 'Rosa Mamani Quispe', telefono, contrasena: CLAVE, aceptaTerminos: true, mayorDeEdad: true },
  });
  expect(registro.status()).toBe(201);
  const { codigoDePrueba } = (await registro.json()) as { codigoDePrueba: string };
  const verificado = await page.request.post('/api/v1/auth/telefono/verificar', {
    data: { telefono, codigo: codigoDePrueba },
  });
  const { tokenAcceso } = (await verificado.json()) as { tokenAcceso: string };
  const materiales = await page.request.put('/api/v1/yo/materiales', {
    headers: { Authorization: `Bearer ${tokenAcceso}` },
    data: { materiales: ['pet'] },
  });
  expect(materiales.status()).toBe(200);
  return telefono;
}

// Con los avisos en vivo siempre hay un sondeo abierto: la red nunca queda «en reposo». Se espera a que cargue la página y a que
// no haya otras solicitudes en camino durante medio segundo, sin contar el sondeo
const enCamino = new WeakMap<Page, Set<Request>>();
export async function esperarRed(page: Page): Promise<void> {
  let conjunto = enCamino.get(page);
  if (!conjunto) {
    const nuevo = new Set<Request>();
    conjunto = nuevo;
    enCamino.set(page, nuevo);
    page.on('request', (peticion) => {
      if (!peticion.url().includes('/api/v1/en-vivo')) nuevo.add(peticion);
    });
    page.on('requestfinished', (peticion) => nuevo.delete(peticion));
    page.on('requestfailed', (peticion) => nuevo.delete(peticion));
  }
  await page.waitForLoadState('load');
  let quieto = 0;
  const limite = Date.now() + 15_000;
  while (quieto < 500 && Date.now() < limite) {
    await page.waitForTimeout(100);
    quieto = conjunto.size === 0 ? quieto + 100 : 0;
  }
}
