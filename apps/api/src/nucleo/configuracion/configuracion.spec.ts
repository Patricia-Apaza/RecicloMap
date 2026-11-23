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
          MAPA_PROVEEDOR: 'google',
          GOOGLE_MAPS_CLAVE_NAVEGADOR: 'clave',
          MENSAJERIA_EXPONER_CODIGO: 'true',
        }),
    ).toThrow(/MENSAJERIA_EXPONER_CODIGO/);
  });

  it('en producción no se permite el servidor público de OpenStreetMap', () => {
    expect(() => new Configuracion({ NODE_ENV: 'production', JWT_SECRETO: 'x'.repeat(48) })).toThrow(
      /servidor público de OpenStreetMap/,
    );
  });
});

describe('Mapa', () => {
  it('sin ninguna clave funciona con OpenStreetMap y su atribución', () => {
    const mapa = new Configuracion({}).mapa;
    expect(mapa.proveedor).toBe('osm');
    expect(mapa.teselas?.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(mapa.teselas?.atribucion).toContain('OpenStreetMap');
    expect(mapa.pinObligatorio).toBe(true);
  });

  it('cambiar de proveedor es solo configuración', () => {
    const maptiler = new Configuracion({ MAPA_PROVEEDOR: 'maptiler', MAPTILER_CLAVE: 'k' }).mapa;
    expect(maptiler.proveedor).toBe('maptiler');
    expect(maptiler.teselas?.url).toContain('api.maptiler.com');
    expect(maptiler.teselas?.atribucion).toContain('MapTiler');
    const propio = new Configuracion({ MAPA_TESELAS_URL: 'https://teselas.example/{z}/{x}/{y}.png' }).mapa;
    expect(propio.teselas?.url).toBe('https://teselas.example/{z}/{x}/{y}.png');
    const google = new Configuracion({ MAPA_PROVEEDOR: 'google', GOOGLE_MAPS_CLAVE_NAVEGADOR: 'k' }).mapa;
    expect(google).toMatchObject({ proveedor: 'google', teselas: null });
  });

  it('un proveedor con clave sin clave se niega a arrancar', () => {
    expect(() => new Configuracion({ MAPA_PROVEEDOR: 'maptiler' })).toThrow(/MAPTILER_CLAVE/);
    expect(() => new Configuracion({ MAPA_PROVEEDOR: 'google' })).toThrow(/GOOGLE_MAPS_CLAVE_NAVEGADOR/);
  });

  it('el buscador de direcciones se identifica con el nombre de RecicloMap', () => {
    const { identidad, url } = new Configuracion({ SOPORTE_CORREO: 'equipo@reciclomap.example' }).geocodificador;
    expect(identidad).toBe('RecicloMap/1.0 (equipo@reciclomap.example)');
    expect(url).toBe('https://nominatim.openstreetmap.org');
  });
});

describe('Límite de intentos de acceso', () => {
  it('es 10 por minuto si no se indica otro', () => {
    expect(limiteAccesoPorMinuto({})).toBe(10);
    expect(limiteAccesoPorMinuto({ API_LIMITE_ACCESO_POR_MINUTO: '200' })).toBe(200);
  });
});
