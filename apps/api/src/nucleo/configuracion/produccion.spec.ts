import { Configuracion, comprobarProduccion } from './configuracion.js';

const BUENA = {
  NODE_ENV: 'production',
  JWT_SECRETO: 'a'.repeat(40),
  WEB_ORIGEN: 'https://reciclomap.example',
  MAPA_PROVEEDOR: 'google',
  GOOGLE_MAPS_CLAVE_NAVEGADOR: 'clave-real-restringida-por-dominio',
  ALMACEN_PROVEEDOR: 's3',
  DB_PROPIETARIO_CLAVE: 'x7Qm2Lw9Zp4Rt8Vb',
  DB_API_CLAVE: 'k3Hs6Nd1Yf5Gu0Ca',
  DB_ADMIN_CLAVE: 'p9Wt4Je7Xo2Mi5Lz',
};

describe('arranque en producción', () => {
  it('con valores reales arranca', () => {
    expect(() => new Configuracion(BUENA)).not.toThrow();
  });

  it.each([
    ['el secreto de ejemplo', { JWT_SECRETO: 'cambia_este_secreto_local_de_32_caracteres_o_mas' }, /JWT_SECRETO/],
    ['la clave de la base de ejemplo', { DB_API_CLAVE: 'cambia_esta_clave_api' }, /DB_API_CLAVE/],
    ['la clave de administración de CI', { DB_ADMIN_CLAVE: 'clave_admin_solo_para_ci' }, /DB_ADMIN_CLAVE/],
    [
      'la clave de mapas de pruebas',
      { GOOGLE_MAPS_CLAVE_NAVEGADOR: 'clave-de-pruebas' },
      /GOOGLE_MAPS_CLAVE_NAVEGADOR/,
    ],
    ['la contraseña de los datos semilla', { SEMILLA_CLAVE: 'Prueba2026!' }, /SEMILLA_CLAVE/],
    ['un origen local', { WEB_ORIGEN: 'http://localhost:3000' }, /WEB_ORIGEN/],
    ['mensajería en memoria', { MENSAJERIA_PROVEEDOR: 'memoria' }, /MENSAJERIA_PROVEEDOR/],
  ])('se niega a arrancar con %s', (_nombre, cambio, mensaje) => {
    expect(() => new Configuracion({ ...BUENA, ...cambio })).toThrow(mensaje);
  });

  it('se niega a mostrar el código de verificación', () => {
    expect(() => new Configuracion({ ...BUENA, MENSAJERIA_EXPONER_CODIGO: 'true' })).toThrow(
      /MENSAJERIA_EXPONER_CODIGO/,
    );
  });

  it('en desarrollo y pruebas no estorba', () => {
    expect(
      () =>
        new Configuracion({ NODE_ENV: 'development', JWT_SECRETO: 'cambia_este_secreto_local_de_32_caracteres_o_mas' }),
    ).not.toThrow();
    expect(() => comprobarProduccion({ ...BUENA })).not.toThrow();
  });

  it('la sesión de administración dura 8 horas por defecto y se puede acortar, no alargar sin límite', () => {
    expect(new Configuracion(BUENA).sesionAdminHoras).toBe(8);
    expect(new Configuracion({ ...BUENA, SESION_ADMIN_HORAS: '4' }).sesionAdminHoras).toBe(4);
    expect(() => new Configuracion({ ...BUENA, SESION_ADMIN_HORAS: '72' })).toThrow();
  });

  it('la documentación solo se enciende en desarrollo o a propósito en pruebas, y nunca en producción', () => {
    expect(new Configuracion({ NODE_ENV: 'development' }).exponeDocumentacion).toBe(true);
    expect(new Configuracion({ NODE_ENV: 'test' }).exponeDocumentacion).toBe(false);
    expect(new Configuracion({ NODE_ENV: 'test', API_DOCUMENTACION: 'true' }).exponeDocumentacion).toBe(true);
    expect(new Configuracion({ ...BUENA, API_DOCUMENTACION: 'true' }).exponeDocumentacion).toBe(false);
  });
});
