import { Configuracion, limiteAccesoPorMinuto } from './configuracion.js';

describe('Configuracion', () => {
  it('usa valores por defecto para el entorno local', () => {
    const configuracion = new Configuracion({});
    expect(configuracion.entorno).toBe('development');
    expect(configuracion.puerto).toBe(3001);
    expect(configuracion.limitePorMinuto).toBe(120);
    expect(configuracion.origenesWeb).toEqual(['http://localhost:3000']);
  });

  it('acepta varios orígenes web separados por coma', () => {
    const configuracion = new Configuracion({ WEB_ORIGEN: 'http://localhost:3000, http://127.0.0.1:3000' });
    expect(configuracion.origenesWeb).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  it('silencia los registros durante las pruebas', () => {
    expect(new Configuracion({ NODE_ENV: 'test', LOG_NIVEL: 'debug' }).nivelLog).toBe('silent');
  });

  it('explica qué variable está mal', () => {
    expect(() => new Configuracion({ API_PUERTO: 'abc' })).toThrow(/API_PUERTO/);
  });
});

describe('Configuracion de sesiones y mensajes', () => {
  it('fuera de producción usa un secreto temporal y el proveedor de mensajes simulado', () => {
    const configuracion = new Configuracion({});
    expect(configuracion.jwtSecreto.length).toBeGreaterThanOrEqual(32);
    expect(configuracion.accesoMinutos).toBe(15);
    expect(configuracion.proveedorMensajes).toBe('simulado');
    expect(configuracion.exponerCodigo).toBe(false);
  });

  it('en producción exige el secreto de sesión', () => {
    expect(() => new Configuracion({ NODE_ENV: 'production' })).toThrow(/JWT_SECRETO/);
  });

  it('en producción nunca devuelve los códigos en la respuesta', () => {
    expect(
      () =>
        new Configuracion({
          NODE_ENV: 'production',
          JWT_SECRETO: 'x'.repeat(48),
          GOOGLE_MAPS_CLAVE_NAVEGADOR: 'clave',
          MENSAJERIA_EXPONER_CODIGO: 'true',
        }),
    ).toThrow(/MENSAJERIA_EXPONER_CODIGO/);
  });

  it('en producción exige la clave de Google Maps', () => {
    expect(() => new Configuracion({ NODE_ENV: 'production', JWT_SECRETO: 'x'.repeat(48) })).toThrow(
      /GOOGLE_MAPS_CLAVE_NAVEGADOR/,
    );
  });
});

describe('Límite de intentos de acceso', () => {
  it('es 10 por minuto si no se indica otro', () => {
    expect(limiteAccesoPorMinuto({})).toBe(10);
    expect(limiteAccesoPorMinuto({ API_LIMITE_ACCESO_POR_MINUTO: '200' })).toBe(200);
  });
});
