import { exigirEntornoDeSemilla } from '../../../prisma/entorno-semilla.js';
import { Configuracion } from './configuracion.js';

// Una demostración válida: producción endurecida, dirección pública con https y contraseña propia para la semilla
const DEMO = {
  NODE_ENV: 'production',
  MODO_DEMOSTRACION: 'true',
  JWT_SECRETO: 'a'.repeat(40),
  WEB_ORIGEN: 'https://demo-reciclomap.example',
  SEMILLA_CLAVE: 'ClaveDeLaDemo-2026',
  MENSAJERIA_EXPONER_CODIGO: 'true',
  ALMACEN_PROVEEDOR: 's3',
  DB_PROPIETARIO_CLAVE: 'x7Qm2Lw9Zp4Rt8Vb',
  DB_API_CLAVE: 'k3Hs6Nd1Yf5Gu0Ca',
  DB_ADMIN_CLAVE: 'p9Wt4Je7Xo2Mi5Lz',
};
const PRODUCCION = {
  ...DEMO,
  MODO_DEMOSTRACION: undefined,
  MAPA_PROVEEDOR: 'google',
  GOOGLE_MAPS_CLAVE_NAVEGADOR: 'k',
};

describe('modo demostración', () => {
  it('con todo en regla arranca, muestra el código de prueba y usa el mapa público de OpenStreetMap', () => {
    const c = new Configuracion(DEMO);
    expect(c.demostracion).toBe(true);
    expect(c.exponerCodigo).toBe(true);
    expect(c.esProduccion).toBe(true);
    expect(c.mapa.proveedor).toBe('osm');
    expect(c.exponeDocumentacion).toBe(false);
    // Un solo origen: solo la dirección pública puede escribir y recibir cookies
    expect(c.origenesWeb).toEqual(['https://demo-reciclomap.example']);
  });

  it('no se activa solo: sin la variable es producción, con todas sus negativas', () => {
    expect(
      new Configuracion({
        ...DEMO,
        MODO_DEMOSTRACION: undefined,
        MENSAJERIA_EXPONER_CODIGO: undefined,
        SEMILLA_CLAVE: undefined,
        MAPA_PROVEEDOR: 'google',
        GOOGLE_MAPS_CLAVE_NAVEGADOR: 'k',
      }).demostracion,
    ).toBe(false);
    expect(() => new Configuracion({ ...DEMO, MODO_DEMOSTRACION: undefined })).toThrow();
    expect(() => new Configuracion(PRODUCCION)).toThrow(/SEMILLA_CLAVE|MENSAJERIA_EXPONER_CODIGO/);
  });

  it.each([
    ['fuera de producción', { NODE_ENV: 'development' }, /solo se usa con NODE_ENV=production/],
    ['con la contraseña de ejemplo', { SEMILLA_CLAVE: 'Prueba2026!' }, /contraseña de ejemplo/],
    ['con una contraseña corta', { SEMILLA_CLAVE: 'corta' }, /al menos 10/],
    ['sin contraseña de semilla', { SEMILLA_CLAVE: undefined }, /SEMILLA_CLAVE/],
    ['con una dirección sin https', { WEB_ORIGEN: 'http://demo.example' }, /https/],
    ['apuntando a localhost', { WEB_ORIGEN: 'https://localhost:3000' }, /https/],
  ])('se niega a arrancar %s', (_nombre, cambio, mensaje) => {
    expect(() => new Configuracion({ ...DEMO, ...cambio })).toThrow(mensaje);
  });

  it('mantiene el resto de la seguridad de producción', () => {
    expect(() => new Configuracion({ ...DEMO, JWT_SECRETO: undefined })).toThrow(/JWT_SECRETO/);
    expect(
      () => new Configuracion({ ...DEMO, JWT_SECRETO: 'cambia_este_secreto_local_de_32_caracteres_o_mas' }),
    ).toThrow(/JWT_SECRETO/);
    expect(() => new Configuracion({ ...DEMO, DB_API_CLAVE: 'cambia_esta_clave_api' })).toThrow(/DB_API_CLAVE/);
    expect(() => new Configuracion({ ...DEMO, ALMACEN_PROVEEDOR: 'memoria' })).toThrow(/ALMACEN_PROVEEDOR/);
    expect(() => new Configuracion({ ...DEMO, MENSAJERIA_PROVEEDOR: 'memoria' })).toThrow(/MENSAJERIA_PROVEEDOR/);
  });

  it('la semilla solo se carga en producción si es una demostración con contraseña propia', () => {
    expect(() => exigirEntornoDeSemilla({ NODE_ENV: 'production' })).toThrow(/solo se cargan en desarrollo o pruebas/);
    expect(() => exigirEntornoDeSemilla({ NODE_ENV: 'production', SEMILLA_CLAVE: 'ClaveDeLaDemo-2026' })).toThrow(
      /solo se cargan/,
    );
    expect(() => exigirEntornoDeSemilla({ NODE_ENV: 'production', MODO_DEMOSTRACION: 'true' })).toThrow(
      /SEMILLA_CLAVE propia/,
    );
    expect(() =>
      exigirEntornoDeSemilla({ NODE_ENV: 'production', MODO_DEMOSTRACION: 'true', SEMILLA_CLAVE: 'Prueba2026!' }),
    ).toThrow(/SEMILLA_CLAVE propia/);
    expect(() =>
      exigirEntornoDeSemilla({
        NODE_ENV: 'production',
        MODO_DEMOSTRACION: 'true',
        SEMILLA_CLAVE: 'ClaveDeLaDemo-2026',
      }),
    ).not.toThrow();
    expect(() => exigirEntornoDeSemilla({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('confiar en el proxy es una cuenta de intermediarios, 0 por defecto', () => {
    expect(new Configuracion({ NODE_ENV: 'development' }).confiarProxy).toBe(0);
    expect(new Configuracion({ NODE_ENV: 'development', CONFIAR_PROXY: '2' }).confiarProxy).toBe(2);
    expect(() => new Configuracion({ NODE_ENV: 'development', CONFIAR_PROXY: '9' })).toThrow();
  });
});
