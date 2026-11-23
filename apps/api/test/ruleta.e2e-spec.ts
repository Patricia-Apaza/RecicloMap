import { randomUUID } from 'node:crypto';
import { ADMIN } from '../prisma/datos-semilla.js';
import { JuegoService } from '../src/modulos/juego/juego.service.js';
import { ProgresoService } from '../src/modulos/juego/progreso.service.js';
import { RuletaService } from '../src/modulos/juego/ruleta.service.js';
import { completarOperacion } from '../src/modulos/operaciones/cierre.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';
import {
  admin as conexionAdmin,
  cerrarConexiones,
  crearOferta,
  crearPublicacion,
  propietario,
  sinReglas,
} from './bd/apoyo.js';

type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

type Premio = {
  id: string;
  nombre: string;
  tipo: string;
  disponible: boolean;
  motivoNoDisponible: string | null;
  probabilidad: number;
};
type Estado = {
  giros: { disponibles: number; puntosPorGiro: number; avance: number; faltan: number };
  puedeGirar: boolean;
  metaMes: { id: string; estado: string; puntosBono: number } | null;
  premios: Premio[];
};
type Giro = {
  id: string;
  repetido: boolean;
  premio: { id: string; nombre: string; tipo: string; puntos: number | null };
  premioGanado: { id: string; estado: string } | null;
  girosRestantes: number;
  puntos: number;
};
type Mis = {
  resumen: { ganados: number; porReclamar: number; reclamados: number; entregados: number; puntosGanados: number };
  items: Array<{ id: string; nombre: string; estado: string; codigo: string | null }>;
};

// Azar controlado: lo que no se programa sale del generador seguro
class AzarControlado {
  cola: number[] = [];
  entero(maximo: number): number {
    return this.cola.shift() ?? Math.floor(Math.random() * maximo);
  }
}

describe('Ruleta, giros y premios (Fase 10B)', () => {
  const azar = new AzarControlado();
  let prueba: Prueba;
  let titicacaId: string;
  let adminToken: string;
  let ruben: string;

  beforeAll(async () => {
    prueba = await crearPrueba({ azar });
    adminToken = await entrar(prueba, ADMIN.telefono);
    ruben = await entrar(prueba, '900000021');
    titicacaId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } })).id;
  });
  afterAll(async () => {
    await cerrarConexiones();
    await prueba.cerrar();
  });
  afterEach(() => {
    azar.cola = [];
  });

  const get = (ruta: string, token: string) => prueba.http().get(`/api/v1${ruta}`).set(bearer(token));
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const estado = async (token: string) => (await get('/yo/ruleta', token).expect(200)).body as Estado;
  const girar = (token: string, clave: string = randomUUID()) => post('/yo/ruleta/girar', token, { clave });
  const premios = async (token: string, filtro = 'todos') =>
    (await get(`/yo/premios?filtro=${filtro}`, token).expect(200)).body as Mis;

  async function recicladorNuevo() {
    const tel = telefono();
    const token = await nuevoReciclador(prueba, tel, 'Rosa Mamani Quispe');
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    return { token, id: usuario.id };
  }

  async function completada(recicladorId: string, kg: number, ahora = new Date()) {
    const publicacionId = await crearPublicacion(recicladorId, { codigoMaterial: 'pet', kg });
    const ofertaId = await crearOferta(publicacionId, titicacaId);
    await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [ofertaId]);
    await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacionId]);
    const nueva = await propietario.query(
      `INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [publicacionId, ofertaId, recicladorId, titicacaId],
    );
    const operacionId = (nueva.rows[0] as { id: string }).id;
    await propietario.query("UPDATE operacion SET estado = 'EN_COORDINACION' WHERE id = $1", [operacionId]);
    await propietario.query("UPDATE operacion SET estado = 'ENTREGADA' WHERE id = $1", [operacionId]);
    await propietario.query(
      "UPDATE operacion SET estado = 'CONFIRMADA', kg_final = $2, monto_final = $3, confirmada_en = now() WHERE id = $1",
      [operacionId, kg, kg * 2.5],
    );
    return prueba.bd.$transaction((tx) => completarOperacion(tx, operacionId, { porPlazo: false, ahora }));
  }

  // 500 kg de reciclaje = 500 puntos = 1 giro
  async function conGiros(cantidad: number) {
    const r = await recicladorNuevo();
    for (let i = 0; i < cantidad; i++) await completada(r.id, 500);
    return r;
  }

  // Número de azar que cae dentro del tramo de un premio, según la configuración vigente
  async function numeroDe(nombre: string): Promise<number> {
    const filas = (
      await propietario.query('SELECT nombre, probabilidad::float8 AS p FROM premio WHERE activo ORDER BY orden')
    ).rows as Array<{ nombre: string; p: number }>;
    let inicio = 0;
    for (const f of filas) {
      if (f.nombre === nombre) return inicio + 1;
      inicio += Math.round(f.p * 100);
    }
    throw new Error(`No existe el premio ${nombre}`);
  }
  const fijarStock = (nombre: string, stock: number | null) =>
    propietario.query('UPDATE premio SET stock = $2 WHERE nombre = $1', [nombre, stock]);

  describe('giros visibles y cómo se ganan', () => {
    it('muestra giros, avance, Meta del mes y los premios con probabilidades que suman 100 %', async () => {
      const r = await recicladorNuevo();
      const e = await estado(r.token);
      expect(e.giros).toEqual({ disponibles: 0, puntosPorGiro: 500, avance: 0, faltan: 500 });
      expect(e.puedeGirar).toBe(true);
      expect(e.metaMes).toMatchObject({ estado: 'EN_PROGRESO', puntosBono: 30 });
      expect(e.premios).toHaveLength(8);
      expect(e.premios.reduce((suma, p) => suma + p.probabilidad, 0)).toBeCloseTo(100, 5);
      expect(e.premios.some((p) => p.tipo === 'SIN_PREMIO')).toBe(true);
    });

    it('el giro llega con 500 puntos de reciclaje, no antes', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 499);
      expect((await estado(r.token)).giros).toMatchObject({ disponibles: 0, avance: 499, faltan: 1 });
      await completada(r.id, 1);
      expect((await estado(r.token)).giros).toMatchObject({ disponibles: 1, avance: 0 });
    });

    it('los puntos de bono no dan giros; la Meta del mes da uno', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 450);
      const meta = (await estado(r.token)).metaMes!;
      await prueba.app.get(ProgresoService).evaluar(r.id, { silencioso: true });
      const reclamo = await post(`/yo/desafios/${meta.id}/reclamar`, r.token).expect(200);
      expect(reclamo.body).toMatchObject({ puntosGanados: 30, giroGanado: true });
      const e = await estado(r.token);
      // 480 puntos en total, pero solo 450 son de reciclaje: el giro es el de la meta
      expect(e.giros).toMatchObject({ disponibles: 1, avance: 450, faltan: 50 });
      const perfil = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: r.id } });
      expect(perfil).toMatchObject({ puntos: 480, puntosReciclaje: 450 });
      // Cruzar los 500 de reciclaje con 50 kg más da otro giro
      await completada(r.id, 50);
      expect((await estado(r.token)).giros.disponibles).toBe(2);
    });

    it('nadie agrega giros a mano: ni la API ni la administración', async () => {
      const r = await recicladorNuevo();
      await expect(prueba.bd.giro.create({ data: { usuarioId: r.id, origen: 'PUNTOS', numero: 1 } })).rejects.toThrow();
    });
  });

  describe('girar: el servidor decide y un giro es un consumo', () => {
    it('el resultado sale del servidor, gasta un giro y la respuesta no revela el azar', async () => {
      const r = await conGiros(1);
      azar.cola = [await numeroDe('+20 puntos')];
      const respuesta = await girar(r.token).expect(200);
      const g = respuesta.body as Giro;
      expect(g.premio.nombre).toBe('+20 puntos');
      expect(g.girosRestantes).toBe(0);
      expect(g.repetido).toBe(false);
      expect(JSON.stringify(g)).not.toMatch(/numeroSorteado|instantanea|azar/i);
      expect((await estado(r.token)).giros.disponibles).toBe(0);
    });

    it('repetir la misma clave devuelve el mismo resultado sin gastar otro giro', async () => {
      const r = await conGiros(2);
      const clave = randomUUID();
      azar.cola = [await numeroDe('+10 puntos')];
      const primero = (await girar(r.token, clave).expect(200)).body as Giro;
      const segundo = (await girar(r.token, clave).expect(200)).body as Giro;
      expect(segundo.id).toBe(primero.id);
      expect(segundo.premio.nombre).toBe(primero.premio.nombre);
      expect(segundo.repetido).toBe(true);
      expect((await estado(r.token)).giros.disponibles).toBe(1);
      expect(await prueba.bd.sorteoRuleta.count({ where: { usuarioId: r.id } })).toBe(1);
    });

    it('dos solicitudes simultáneas con la misma clave dan un solo resultado y gastan un giro', async () => {
      const r = await conGiros(2);
      const clave = randomUUID();
      azar.cola = [await numeroDe('+10 puntos')];
      const [a, b] = await Promise.all([girar(r.token, clave), girar(r.token, clave)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect((a.body as Giro).id).toBe((b.body as Giro).id);
      expect(await prueba.bd.sorteoRuleta.count({ where: { usuarioId: r.id } })).toBe(1);
      expect((await estado(r.token)).giros.disponibles).toBe(1);
    });

    it('con un solo giro, dos solicitudes simultáneas con claves distintas: solo una gana', async () => {
      const r = await conGiros(1);
      const [a, b] = await Promise.all([girar(r.token), girar(r.token)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const perdedora = a.status === 409 ? a : b;
      expect(codigo(perdedora)).toBe('SIN_GIROS');
      expect(await prueba.bd.sorteoRuleta.count({ where: { usuarioId: r.id } })).toBe(1);
    });

    it('sin giros, sin clave o sin teléfono verificado no se puede girar', async () => {
      const sin = await recicladorNuevo();
      expect(codigo(await girar(sin.token).expect(409))).toBe('SIN_GIROS');
      await post('/yo/ruleta/girar', sin.token, {}).expect(400);
      const sinTelefono = await conGiros(1);
      await propietario.query('UPDATE usuario SET telefono_verificado_en = NULL WHERE id = $1', [sinTelefono.id]);
      expect(codigo(await girar(sinTelefono.token).expect(403))).toBe('RULETA_REQUIERE_TELEFONO');
      expect((await estado(sinTelefono.token)).puedeGirar).toBe(false);
    });

    it('un premio de puntos suma al saldo como bono, sin dar giros, y queda en el libro', async () => {
      const r = await conGiros(1);
      azar.cola = [await numeroDe('+50 puntos')];
      const g = (await girar(r.token).expect(200)).body as Giro;
      expect(g.puntos).toBe(550);
      const perfil = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: r.id } });
      expect(perfil).toMatchObject({ puntos: 550, puntosReciclaje: 500 });
      const mov = await prueba.bd.movimientoPuntos.findFirstOrThrow({ where: { usuarioId: r.id, motivo: 'RULETA' } });
      expect(mov).toMatchObject({ puntos: 50, cuentaParaGiros: false });
      expect((await estado(r.token)).giros).toMatchObject({ disponibles: 0, avance: 0, faltan: 500 });
      expect((await premios(r.token)).items[0]).toMatchObject({ nombre: '+50 puntos', estado: 'ACREDITADO' });
    });

    it('los puntos de la ruleta son de bono: ni dan giros ni suben el nivel ni cuentan como kilos', async () => {
      const r = await conGiros(1);
      const antes = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: r.id } });
      // Aunque el bono cruce el umbral de otro giro (550 puntos en total), no nace ningún giro
      azar.cola = [await numeroDe('+50 puntos')];
      await girar(r.token).expect(200);
      const despues = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: r.id } });
      expect(despues.puntos).toBe(antes.puntos + 50);
      expect(despues.puntosReciclaje).toBe(antes.puntosReciclaje);
      expect(Number(despues.kgTotal)).toBe(Number(antes.kgTotal));
      expect(despues.nivelId).toBe(antes.nivelId);
      expect(despues.operacionesCompletadas).toBe(antes.operacionesCompletadas);
      expect(await prueba.bd.giro.count({ where: { usuarioId: r.id } })).toBe(1);
      expect((await estado(r.token)).giros.disponibles).toBe(0);
    });

    it('"Sigue intentando" gasta el giro y no entrega nada', async () => {
      const r = await conGiros(1);
      azar.cola = [await numeroDe('Sigue intentando')];
      const g = (await girar(r.token).expect(200)).body as Giro;
      expect(g.premio.tipo).toBe('SIN_PREMIO');
      expect(g.premioGanado).toBeNull();
      expect((await premios(r.token)).items).toHaveLength(0);
    });

    it('cada giro queda auditado con su azar, la foto de las probabilidades y el stock', async () => {
      const r = await conGiros(1);
      azar.cola = [await numeroDe('Gorra RecicloMap')];
      await girar(r.token).expect(200);
      const sorteo = await prueba.bd.sorteoRuleta.findFirstOrThrow({ where: { usuarioId: r.id } });
      expect(sorteo.numeroSorteado).toBe(await numeroDe('Gorra RecicloMap'));
      const foto = sorteo.instantanea as {
        escala: number;
        premios: Array<{ nombre: string; stock: number | null; efectiva: number }>;
      };
      expect(foto.escala).toBe(10_000);
      expect(foto.premios).toHaveLength(8);
      expect(foto.premios.find((p) => p.nombre === 'Gorra RecicloMap')).toMatchObject({ stock: expect.any(Number) });
      expect(sorteo.claveSolicitud).toBeTruthy();
      expect(
        await propietario
          .query('UPDATE sorteo_ruleta SET numero_sorteado = 1 WHERE id = $1', [sorteo.id])
          .catch(() => 'bloqueado'),
      ).toBe('bloqueado');
    });
  });

  describe('stock y campaña', () => {
    it('un premio sin stock no sale: su giro cae en "Sigue intentando" y la pantalla lo dice', async () => {
      const r = await conGiros(1);
      await fijarStock('Kit escolar', 0);
      try {
        const e = await estado(r.token);
        const kit = e.premios.find((p) => p.nombre === 'Kit escolar')!;
        expect(kit).toMatchObject({ disponible: false, motivoNoDisponible: 'SIN_STOCK', probabilidad: 0 });
        expect(e.premios.find((p) => p.tipo === 'SIN_PREMIO')!.probabilidad).toBe(25);
        expect(e.premios.reduce((suma, p) => suma + p.probabilidad, 0)).toBeCloseTo(100, 5);
        azar.cola = [await numeroDe('Kit escolar')];
        const g = (await girar(r.token).expect(200)).body as Giro;
        expect(g.premio.tipo).toBe('SIN_PREMIO');
        const sorteo = await prueba.bd.sorteoRuleta.findFirstOrThrow({ where: { usuarioId: r.id } });
        expect((sorteo.instantanea as { reemplazo: string }).reemplazo).toBe('SIN_STOCK');
      } finally {
        await fijarStock('Kit escolar', 10);
      }
    });

    it('la última unidad no sale dos veces aunque los giros sean simultáneos', async () => {
      const recicladores = await Promise.all([conGiros(1), conGiros(1), conGiros(1), conGiros(1)]);
      await fijarStock('Botella reutilizable', 1);
      try {
        const n = await numeroDe('Botella reutilizable');
        azar.cola = [n, n, n, n];
        const respuestas = await Promise.all(recicladores.map((r) => girar(r.token)));
        const nombres = respuestas.map((x) => (x.body as Giro).premio.nombre);
        expect(respuestas.every((x) => x.status === 200)).toBe(true);
        expect(nombres.filter((x) => x === 'Botella reutilizable')).toHaveLength(1);
        expect(nombres.filter((x) => x === 'Sigue intentando')).toHaveLength(3);
        const stock = (await propietario.query("SELECT stock FROM premio WHERE nombre = 'Botella reutilizable'"))
          .rows[0] as {
          stock: number;
        };
        expect(stock.stock).toBe(0);
      } finally {
        await fijarStock('Botella reutilizable', 25);
      }
    });

    it('un premio fuera de su campaña no sale', async () => {
      const r = await conGiros(1);
      await propietario.query(
        "UPDATE premio SET vigente_hasta = now() - interval '1 day' WHERE nombre = 'Bolsas reutilizables'",
      );
      try {
        const e = await estado(r.token);
        expect(e.premios.find((p) => p.nombre === 'Bolsas reutilizables')).toMatchObject({
          disponible: false,
          motivoNoDisponible: 'FUERA_DE_CAMPANA',
        });
        azar.cola = [await numeroDe('Bolsas reutilizables')];
        expect(((await girar(r.token).expect(200)).body as Giro).premio.tipo).toBe('SIN_PREMIO');
      } finally {
        await propietario.query("UPDATE premio SET vigente_hasta = NULL WHERE nombre = 'Bolsas reutilizables'");
      }
    });

    it('una ruleta que no suma 100 % se detiene en lugar de sortear mal', async () => {
      const r = await conGiros(1);
      await propietario.query("UPDATE premio SET probabilidad = probabilidad + 5 WHERE nombre = '+10 puntos'");
      try {
        expect(codigo(await girar(r.token).expect(503))).toBe('RULETA_NO_DISPONIBLE');
        // Falla sin consumir el giro y deja una alerta para la administración
        expect(await prueba.bd.sorteoRuleta.count({ where: { usuarioId: r.id } })).toBe(0);
        expect(await prueba.bd.giro.count({ where: { usuarioId: r.id, usadoEn: null } })).toBe(1);
        const admin = await prueba.bd.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } });
        expect(
          await prueba.bd.notificacion.count({
            where: { usuarioId: admin.id, titulo: 'La ruleta no está disponible' },
          }),
        ).toBeGreaterThanOrEqual(1);
      } finally {
        await propietario.query("UPDATE premio SET probabilidad = probabilidad - 5 WHERE nombre = '+10 puntos'");
      }
      expect((await estado(r.token)).giros.disponibles).toBe(1);
    });
  });

  describe('Mis premios: Ganado → Reclamado → Entregado, o Vencido', () => {
    async function ganarObjeto() {
      const r = await conGiros(1);
      azar.cola = [await numeroDe('Gorra RecicloMap')];
      const g = (await girar(r.token).expect(200)).body as Giro;
      return { ...r, ganadoId: g.premioGanado!.id };
    }

    it('al ganar queda por reclamar, sin código visible, con stock descontado', async () => {
      const antes = (await propietario.query("SELECT stock FROM premio WHERE nombre = 'Gorra RecicloMap'")).rows[0] as {
        stock: number;
      };
      const r = await ganarObjeto();
      const despues = (await propietario.query("SELECT stock FROM premio WHERE nombre = 'Gorra RecicloMap'"))
        .rows[0] as { stock: number };
      expect(despues.stock).toBe(antes.stock - 1);
      const mis = await premios(r.token);
      expect(mis.items[0]).toMatchObject({ nombre: 'Gorra RecicloMap', estado: 'POR_RECLAMAR', codigo: null });
      expect(mis.resumen).toMatchObject({ ganados: 1, porReclamar: 1, entregados: 0 });
    });

    it('el reciclador reclama y ve el código; solo administración lo marca como entregado', async () => {
      const r = await ganarObjeto();
      const reclamo = (await post(`/yo/premios/${r.ganadoId}/reclamar`, r.token).expect(200)).body as {
        estado: string;
        codigo: string;
        puntoEntrega: string;
      };
      expect(reclamo.estado).toBe('RECLAMADO');
      expect(reclamo.codigo).toMatch(/^RM-[A-Z0-9]{4}$/);
      expect(reclamo.puntoEntrega).toContain('Titicaca');
      expect(codigo(await post(`/yo/premios/${r.ganadoId}/reclamar`, r.token).expect(409))).toBe('PREMIO_YA_RECLAMADO');
      expect((await premios(r.token, 'reclamados')).items[0]).toMatchObject({ codigo: reclamo.codigo });
    });

    it('la entrega solo la marca la conexión de administración', async () => {
      const r = await ganarObjeto();
      await post(`/yo/premios/${r.ganadoId}/reclamar`, r.token).expect(200);
      // Sin constancia de auditoría la base lo rechaza; la entrega real pasa por la API de administración
      await expect(
        conexionAdmin.query("UPDATE premio_ganado SET estado = 'ENTREGADO' WHERE id = $1", [r.ganadoId]),
      ).rejects.toMatchObject({ code: 'RM039' });
      const codigoPremio = (await prueba.bd.premioGanado.findUniqueOrThrow({ where: { id: r.ganadoId } })).codigo;
      await post('/admin/premios-entregas', adminToken, { codigo: codigoPremio }).expect(200);
      const mis = await premios(r.token, 'entregados');
      expect(mis.items[0]).toMatchObject({ estado: 'ENTREGADO' });
      expect(mis.resumen.entregados).toBe(1);
    });

    it('un premio ajeno no se puede reclamar', async () => {
      const dueno = await ganarObjeto();
      const otro = await recicladorNuevo();
      expect(codigo(await post(`/yo/premios/${dueno.ganadoId}/reclamar`, otro.token).expect(404))).toBe(
        'NO_ENCONTRADO',
      );
    });

    it('un premio vencido no se puede reclamar y aparece como vencido', async () => {
      const r = await ganarObjeto();
      await sinReglas((c) =>
        c.query(
          "UPDATE premio_ganado SET vence_en = now() - interval '1 day', creado_en = now() - interval '31 days' WHERE id = $1",
          [r.ganadoId],
        ),
      );
      expect(codigo(await post(`/yo/premios/${r.ganadoId}/reclamar`, r.token).expect(409))).toBe('PREMIO_VENCIDO');
      const mis = await premios(r.token);
      expect(mis.items[0]).toMatchObject({ estado: 'VENCIDO' });
    });

    it('avisa una sola vez de un premio por vencer, si el usuario no apagó los avisos de premios', async () => {
      const r = await ganarObjeto();
      await sinReglas((c) =>
        c.query("UPDATE premio_ganado SET vence_en = now() + interval '2 days' WHERE id = $1", [r.ganadoId]),
      );
      await prueba.app.get(RuletaService).avisarPorVencer();
      await prueba.app.get(RuletaService).avisarPorVencer();
      const avisos = await prueba.bd.notificacion.findMany({
        where: { usuarioId: r.id, titulo: { contains: 'por vencer' } },
      });
      expect(avisos).toHaveLength(1);
    });

    it('los avisos de premios respetan la preferencia del usuario', async () => {
      const r = await conGiros(1);
      await prueba.bd.preferenciaUsuario.update({ where: { usuarioId: r.id }, data: { notifPremios: false } });
      azar.cola = [await numeroDe('+20 puntos')];
      await girar(r.token).expect(200);
      expect(await prueba.bd.notificacion.count({ where: { usuarioId: r.id, tipo: 'GIRO' } })).toBe(0);
    });

    it('al ganar un premio llega el aviso y se otorga la insignia Primer giro', async () => {
      const r = await conGiros(1);
      azar.cola = [await numeroDe('+10 puntos')];
      await girar(r.token).expect(200);
      expect(await prueba.bd.notificacion.count({ where: { usuarioId: r.id, tipo: 'GIRO' } })).toBe(1);
      const insignias = (await get('/yo/insignias', r.token).expect(200)).body as {
        datos: Array<{ codigo: string; lograda: boolean }>;
      };
      expect(insignias.datos.find((d) => d.codigo === 'primer_giro')!.lograda).toBe(true);
    });
  });

  describe('permisos y ajustes de la 10A', () => {
    it('solo recicladores usan la ruleta y los premios', async () => {
      for (const token of [adminToken, ruben]) {
        await get('/yo/ruleta', token).expect(403);
        await girar(token).expect(403);
        await get('/yo/premios', token).expect(403);
      }
      await prueba.http().get('/api/v1/yo/ruleta').expect(401);
    });

    it('Semilla se entrega al verificar el teléfono, sin elegir materiales', async () => {
      const r = await recicladorNuevo();
      const semilla = await prueba.bd.insignia.findUniqueOrThrow({ where: { codigo: 'semilla' } });
      expect(await prueba.bd.usuarioInsignia.count({ where: { usuarioId: r.id, insigniaId: semilla.id } })).toBe(1);
    });

    it('invitación: quien invita y el invitado ganan 10 puntos de bono que no dan giros', async () => {
      const invitador = await recicladorNuevo();
      const invitado = await recicladorNuevo();
      await prueba.bd.invitacion.create({ data: { invitadorId: invitador.id, invitadoId: invitado.id } });
      const cierre = await completada(invitado.id, 10);
      await prueba.app.get(ProgresoService).despuesDeCompletar(cierre);
      for (const id of [invitador.id, invitado.id]) {
        const perfil = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: id } });
        const bono = await prueba.bd.movimientoPuntos.findFirstOrThrow({
          where: { usuarioId: id, motivo: 'INVITACION' },
        });
        expect(bono).toMatchObject({ puntos: 10, cuentaParaGiros: false });
        expect(perfil.puntosReciclaje).toBe(id === invitado.id ? 10 : 0);
      }
      const puntos = (await get('/yo/puntos', invitado.token).expect(200)).body as {
        movimientos: Array<{ descripcion: string }>;
        invitacion: { puntosGanados: number };
      };
      expect(puntos.movimientos.some((m) => m.descripcion.startsWith('Bienvenida'))).toBe(true);
      expect(puntos.invitacion.puntosGanados).toBe(0);
    });

    it('Cazador de desafíos pide un desafío reclamado en 3 meses distintos', async () => {
      const r = await recicladorNuevo();
      const plantilla = await prueba.bd.plantillaDesafio.findFirstOrThrow({ where: { esMetaMes: true } });
      for (const mes of ['2030-01-01', '2030-02-01', '2030-03-01']) {
        const d = await prueba.bd.desafio
          .create({
            data: {
              plantillaId: plantilla.id,
              mes: new Date(`${mes}T00:00:00Z`),
              meta: 100,
              puntos: 30,
              esMetaMes: false,
            },
          })
          .catch(() => null);
        if (!d) continue;
        await prueba.bd.usuarioDesafio.create({
          data: { usuarioId: r.id, desafioId: d.id, completadoEn: new Date(), reclamadoEn: new Date() },
        });
        const insignias = (await get('/yo/insignias', r.token).expect(200)).body as {
          datos: Array<{ codigo: string; lograda: boolean; actual: number; meta: number }>;
        };
        const cazador = insignias.datos.find((x) => x.codigo === 'cazador_de_desafios')!;
        expect(cazador.meta).toBe(3);
        expect(cazador.lograda).toBe(mes === '2030-03-01');
      }
    });
  });

  it('el servicio de juego sigue disponible', () => {
    expect(prueba.app.get(JuegoService)).toBeDefined();
  });
});
