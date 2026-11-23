import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { bearer, crearPrueba, entrar, type Prueba } from './apoyo.js';

type Pedido = { url: string; cabeceras: IncomingHttpHeaders; en: number };

// Un Nominatim simulado: registra cada solicitud para comprobar la identidad, la espera y que no llega la IP
let servidor: Server;
let pedidos: Pedido[] = [];
let respuesta: { estado: number; cuerpo: unknown } = { estado: 200, cuerpo: [] };
let prueba: Prueba;
let token: string;

const UNA = [{ display_name: 'Jirón Moquegua 450, Juliaca, Puno, Perú', lat: '-15.4927', lon: '-70.1342' }];

describe('Búsqueda de direcciones (Nominatim simulado)', () => {
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      pedidos.push({ url: req.url ?? '', cabeceras: req.headers, en: Date.now() });
      res.writeHead(respuesta.estado, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(respuesta.cuerpo));
    });
    await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
    process.env.GEOCODIFICADOR_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    process.env.GEOCODIFICADOR_IDENTIDAD = 'RecicloMap/1.0 (pruebas@reciclomap.test)';
    prueba = await crearPrueba();
    token = await entrar(prueba, '900000001');
  });
  afterAll(async () => {
    delete process.env.GEOCODIFICADOR_URL;
    delete process.env.GEOCODIFICADOR_IDENTIDAD;
    await prueba.cerrar();
    await new Promise((listo) => servidor.close(listo));
  });
  beforeEach(() => {
    pedidos = [];
    respuesta = { estado: 200, cuerpo: UNA };
  });

  const buscar = (q: string, quien: string | null = token) => {
    const peticion = prueba.http().get('/api/v1/direcciones/buscar').query({ q }).set('X-Forwarded-For', '203.0.113.9');
    return quien ? peticion.set(bearer(quien)) : peticion;
  };

  it('exige sesión y valida el texto', async () => {
    await buscar('Moquegua', null).expect(401);
    await buscar('ab').expect(400);
    await buscar('x'.repeat(121)).expect(400);
    expect(pedidos).toHaveLength(0);
  });

  it('devuelve resultados de Perú y se identifica; el servicio no recibe la IP de la persona', async () => {
    const r = await buscar('Moquegua 450 Juliaca').expect(200);
    expect(r.body).toEqual({
      resultados: [{ nombre: 'Jirón Moquegua 450, Juliaca, Puno, Perú', lat: -15.4927, lng: -70.1342 }],
    });
    expect(pedidos).toHaveLength(1);
    const [pedido] = pedidos;
    expect(pedido!.cabeceras['user-agent']).toBe('RecicloMap/1.0 (pruebas@reciclomap.test)');
    for (const nombre of ['x-forwarded-for', 'x-real-ip', 'forwarded', 'cookie', 'authorization']) {
      expect(pedido!.cabeceras[nombre]).toBeUndefined();
    }
    const parametros = new URL(pedido!.url, 'http://x').searchParams;
    expect(parametros.get('countrycodes')).toBe('pe');
    expect(parametros.get('q')).toBe('Moquegua 450 Juliaca');
    expect(Number(parametros.get('limit'))).toBeLessThanOrEqual(5);
  });

  it('guarda en caché: la misma búsqueda no vuelve a salir, aunque cambien mayúsculas y espacios', async () => {
    await buscar('Plaza de Armas Juliaca').expect(200);
    await buscar('  plaza  de armas JULIACA ').expect(200);
    expect(pedidos).toHaveLength(1);
  });

  it('respeta 1 solicitud por segundo para toda la app, aunque lleguen varias a la vez', async () => {
    const lote = await Promise.all(['Av. Circunvalación', 'Jr. Lampa', 'Mercado Santa Bárbara'].map((q) => buscar(q)));
    for (const r of lote) expect(r.status).toBe(200);
    expect(pedidos).toHaveLength(3);
    const tiempos = pedidos.map((p) => p.en).sort((a, b) => a - b);
    expect(tiempos[1]! - tiempos[0]!).toBeGreaterThanOrEqual(1000);
    expect(tiempos[2]! - tiempos[1]!).toBeGreaterThanOrEqual(1000);
  }, 15_000);

  it('si el servicio falla responde un aviso claro y no guarda el fallo', async () => {
    respuesta = { estado: 500, cuerpo: {} };
    const r = await buscar('Jr. Puno 100').expect(503);
    expect((r.body as { error: { codigo: string } }).error.codigo).toBe('BUSQUEDA_NO_DISPONIBLE');
    respuesta = { estado: 200, cuerpo: UNA };
    await buscar('Jr. Puno 100').expect(200);
  }, 15_000);
});
