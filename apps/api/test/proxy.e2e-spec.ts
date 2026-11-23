import { crearPrueba, type Prueba } from './apoyo.js';

const intentos = (prueba: Prueba, desde: (n: number) => string) =>
  Promise.all(
    Array.from({ length: 14 }, (_, n) =>
      prueba
        .http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', desde(n))
        .send({ identificador: '999999999', contrasena: 'incorrecta-123' }),
    ),
  );
const limitados = (respuestas: Array<{ status: number }>) => respuestas.filter((r) => r.status === 429).length;

// Detrás de la web y del túnel, la IP de la persona llega en X-Forwarded-For: los límites deben ser por persona
describe('límites por persona detrás de intermediarios', () => {
  it('sin confiar en el proxy todas las solicitudes comparten la IP del intermediario y se limitan juntas', async () => {
    delete process.env.CONFIAR_PROXY;
    const prueba = await crearPrueba({ conLimite: true });
    try {
      expect(limitados(await intentos(prueba, (n) => `10.0.0.${n}, 127.0.0.1`))).toBeGreaterThan(0);
    } finally {
      await prueba.cerrar();
    }
  });

  it('con CONFIAR_PROXY=2 cada persona tiene su propio límite, y una IP falsa al inicio no la cambia', async () => {
    process.env.CONFIAR_PROXY = '2';
    const prueba = await crearPrueba({ conLimite: true });
    try {
      expect(limitados(await intentos(prueba, (n) => `10.0.0.${n}, 127.0.0.1`))).toBe(0);
      // Quien repite la misma IP real sí se limita, aunque ponga IP falsas delante
      const mismoReal = await intentos(prueba, (n) => `66.6.6.${n}, 10.9.9.9, 127.0.0.1`);
      expect(limitados(mismoReal)).toBeGreaterThan(0);
    } finally {
      delete process.env.CONFIAR_PROXY;
      await prueba.cerrar();
    }
  });
});
