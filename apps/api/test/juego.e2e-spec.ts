import { vi } from 'vitest';
import { ADMIN } from '../prisma/datos-semilla.js';
import { JuegoService } from '../src/modulos/juego/juego.service.js';
import { ProgresoService } from '../src/modulos/juego/progreso.service.js';
import { completarOperacion } from '../src/modulos/operaciones/cierre.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';
import { cerrarConexiones, crearOferta, crearPublicacion, propietario } from './bd/apoyo.js';

type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

type Puntos = {
  puntos: number;
  kgTotal: number;
  nivel: { numero: number; nombre: string };
  movimientos: Array<{ descripcion: string; puntos: number }>;
  invitacion: { puntosGanados: number; invitados: number; completaron: number };
};
type Insignias = {
  logradas: number;
  datos: Array<{ codigo: string; lograda: boolean; actual: number; meta: number }>;
};
type Desafio = {
  id: string;
  nombre: string;
  esMetaMes: boolean;
  estado: string;
  progreso: number;
  meta: number;
  puntos: number;
  delMesAnterior: boolean;
};
type Entrega = { id: string; estado: string; kg: number; kgConfirmado: number | null; puntosOtorgados: number };

describe('Juego: puntos, niveles, insignias, desafíos, ranking y entrega directa (Fase 10A)', () => {
  let prueba: Prueba;
  let admin: string;
  let titicaca: string;
  let ruben: string;
  let titicacaId: string;
  let titicacaUsuarioId: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    titicaca = await entrar(prueba, '900000011');
    ruben = await entrar(prueba, '900000021');
    const t = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } });
    titicacaId = t.id;
    titicacaUsuarioId = t.usuarioId;
  });
  afterAll(async () => {
    vi.useRealTimers();
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const http = () => prueba.http();
  const get = (ruta: string, token: string) => http().get(`/api/v1${ruta}`).set(bearer(token));
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const put = (ruta: string, token: string, cuerpo: object = {}) =>
    http().put(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);

  async function recicladorNuevo() {
    const tel = telefono();
    const token = await nuevoReciclador(prueba, tel, 'Rosa Mamani Quispe');
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    return { token, id: usuario.id, telefono: tel };
  }

  const puntos = async (token: string) => (await get('/yo/puntos', token).expect(200)).body as Puntos;
  const insignias = async (token: string) => (await get('/yo/insignias', token).expect(200)).body as Insignias;
  const tiene = (i: Insignias, codigoInsignia: string) => i.datos.find((d) => d.codigo === codigoInsignia)!.lograda;
  const desafios = async (token: string) =>
    (await get('/yo/desafios', token).expect(200)).body as { mes: string; datos: Desafio[] };
  const registroDe = (id: string) => prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: id } });
  const progreso = () => prueba.app.get(ProgresoService);

  // Operación completada con efectos reales (libro, kilos, nivel, giros) y fechas controladas
  async function completada(
    recicladorId: string,
    kg: number,
    opciones: {
      compradorId?: string;
      ahora?: Date;
      confirmadaEn?: string;
      ofertas?: number;
      mayorTotal?: boolean;
      material?: string;
    } = {},
  ) {
    const compradorId = opciones.compradorId ?? titicacaId;
    const publicacionId = await crearPublicacion(recicladorId, { codigoMaterial: opciones.material ?? 'pet', kg });
    const ofertaId = await crearOferta(publicacionId, compradorId);
    await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [ofertaId]);
    await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacionId]);
    const nueva = await propietario.query(
      `INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id, ofertas_al_aceptar, acepto_mayor_total)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [publicacionId, ofertaId, recicladorId, compradorId, opciones.ofertas ?? 1, opciones.mayorTotal ?? false],
    );
    const operacionId = (nueva.rows[0] as { id: string }).id;
    await propietario.query("UPDATE operacion SET estado = 'EN_COORDINACION' WHERE id = $1", [operacionId]);
    await propietario.query("UPDATE operacion SET estado = 'ENTREGADA' WHERE id = $1", [operacionId]);
    await propietario.query(
      "UPDATE operacion SET estado = 'CONFIRMADA', kg_final = $2, monto_final = $3, confirmada_en = $4 WHERE id = $1",
      [operacionId, kg, kg * 2.5, opciones.confirmadaEn ?? new Date().toISOString()],
    );
    const ahora = opciones.ahora ?? new Date();
    const cierre = await prueba.bd.$transaction((tx) =>
      completarOperacion(tx, operacionId, { porPlazo: false, ahora }),
    );
    return { operacionId, cierre };
  }

  function entregaDirecta(token: string, material: string, kg: number, extra: object = {}) {
    return post('/registros-directos', token, { compradorId: titicacaId, material, kg, ...extra });
  }
  const confirmarEntrega = (id: string, kg: number, token = titicaca) =>
    post(`/mi-negocio/entregas-directas/${id}/confirmar`, token, { kg });

  describe('Puntos y libro de movimientos (decisión 1)', () => {
    it('solo se otorgan al completar: confirmada no da nada, "conforme" da 1 punto por kg y no se repite', async () => {
      const r = await recicladorNuevo();
      const pub = (
        await post('/publicaciones', r.token, { material: 'pet', kg: 20 })
          .set('X-Posicion', '-15.497,-70.133')
          .expect(201)
      ).body as { publicacion: { id: string } };
      const oferta = (
        await post(`/negocio/publicaciones/${pub.publicacion.id}/ofertas`, titicaca, { precioKg: 2.5 }).expect(201)
      ).body as { id: string };
      const { operacionId } = (await post(`/ofertas/${oferta.id}/aceptar`, r.token).expect(200)).body as {
        operacionId: string;
      };
      await post(`/operaciones/${operacionId}/coordinar`, r.token, {
        tipo: 'REFERENCIA',
        referencia: 'Frente al mercado',
      }).expect(200);
      await post(`/operaciones/${operacionId}/entregar`, r.token).expect(200);
      await post(`/operaciones/${operacionId}/confirmar`, titicaca, { kgRecibidos: 18 }).expect(200);
      expect((await puntos(r.token)).puntos).toBe(0);

      await post(`/operaciones/${operacionId}/conforme`, r.token).expect(200);
      const despues = await puntos(r.token);
      expect(despues.puntos).toBe(18);
      expect(despues.kgTotal).toBe(18);
      expect(despues.movimientos[0]).toMatchObject({ puntos: 18 });
      expect(despues.movimientos[0]!.descripcion).toContain('Operación completada');
      expect(Object.keys(despues)).not.toContain('giros');

      expect(codigo(await post(`/operaciones/${operacionId}/conforme`, r.token).expect(409))).toBe(
        'OPERACION_NO_CONFIRMADA',
      );
      const ledger = await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id } });
      expect(ledger).toBe(1);
    });

    it('una operación cancelada no suma nada', async () => {
      const r = await recicladorNuevo();
      const pub = (
        await post('/publicaciones', r.token, { material: 'pet', kg: 12 })
          .set('X-Posicion', '-15.497,-70.133')
          .expect(201)
      ).body as { publicacion: { id: string } };
      const oferta = (
        await post(`/negocio/publicaciones/${pub.publicacion.id}/ofertas`, titicaca, { precioKg: 2.5 }).expect(201)
      ).body as { id: string };
      const { operacionId } = (await post(`/ofertas/${oferta.id}/aceptar`, r.token).expect(200)).body as {
        operacionId: string;
      };
      await post(`/operaciones/${operacionId}/cancelar`, r.token, { motivo: 'Ya no puedo' }).expect(200);
      expect((await puntos(r.token)).puntos).toBe(0);
      expect(await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id } })).toBe(0);
    });

    it('no hay forma de escribir puntos por la API ni con un token de administración', async () => {
      const r = await recicladorNuevo();
      await post('/yo/puntos', r.token, { puntos: 500 }).expect(404);
      await put('/yo/puntos', r.token, { puntos: 500 }).expect(404);
      await get('/yo/puntos', admin).expect(403);
      await get('/yo/puntos', titicaca).expect(403);
      await http().get('/api/v1/yo/puntos').expect(401);
    });
  });

  describe('Niveles por kilos (decisión 2)', () => {
    it('tiene los 6 niveles con sus umbrales exactos y los nombres definidos', async () => {
      const r = await recicladorNuevo();
      const n = (await get('/yo/niveles', r.token).expect(200)).body as {
        niveles: Array<{ nombre: string; kgMin: number }>;
        semanas: unknown[];
      };
      expect(n.niveles.map((x) => [x.nombre, x.kgMin])).toEqual([
        ['Semilla', 0],
        ['Brote', 50],
        ['Recolector', 200],
        ['Guardián', 500],
        ['Maestro', 1000],
        ['Leyenda', 2500],
      ]);
      expect(n.semanas).toHaveLength(8);
    });

    it.each([
      [0, 1, 'Semilla'],
      [49.99, 1, 'Semilla'],
      [50, 2, 'Brote'],
      [199.99, 2, 'Brote'],
      [200, 3, 'Recolector'],
      [499.99, 3, 'Recolector'],
      [500, 4, 'Guardián'],
      [999.99, 4, 'Guardián'],
      [1000, 5, 'Maestro'],
      [2499.99, 5, 'Maestro'],
      [2500, 6, 'Leyenda'],
    ])('con %s kg el nivel es %s (%s)', async (kg, numero, nombre) => {
      const r = await recicladorNuevo();
      await prueba.bd.recicladorPerfil.update({ where: { usuarioId: r.id }, data: { kgTotal: kg } });
      const n = (await get('/yo/niveles', r.token).expect(200)).body as { nivel: { numero: number; nombre: string } };
      expect(n.nivel).toEqual({ numero, nombre });
    });

    it('subir de nivel avisa como progreso y respeta la preferencia de avisos de juego', async () => {
      const r = await recicladorNuevo();
      const { cierre } = await completada(r.id, 60);
      expect(cierre.nivel).toMatchObject({ subio: true, nombre: 'Brote' });
      await progreso().despuesDeCompletar(cierre);
      const lista = (await get('/notificaciones', r.token).expect(200)).body as {
        datos: Array<{ tipo: string; titulo: string }>;
      };
      expect(lista.datos.some((n) => n.tipo === 'NIVEL' && n.titulo.includes('Brote'))).toBe(true);

      const silenciosa = await recicladorNuevo();
      await prueba.bd.preferenciaUsuario.update({ where: { usuarioId: silenciosa.id }, data: { notifPremios: false } });
      const otra = await completada(silenciosa.id, 60);
      await progreso().despuesDeCompletar(otra.cierre);
      const sin = (await get('/notificaciones', silenciosa.token).expect(200)).body as {
        datos: Array<{ tipo: string }>;
      };
      expect(sin.datos.some((n) => n.tipo === 'NIVEL')).toBe(false);
      expect((await puntos(silenciosa.token)).nivel.nombre).toBe('Brote');
    });
  });

  describe('Insignias (decisión 4): 12 criterios fijos, calculados en el servidor', () => {
    it('el catálogo tiene las 12 insignias y el reciclador nuevo no tiene ninguna lograda de más', async () => {
      const r = await recicladorNuevo();
      const lista = await insignias(r.token);
      expect(lista.datos.map((d) => d.codigo)).toEqual([
        'semilla',
        'recolector',
        'guardian',
        'maestro',
        'racha_4_semanas',
        'madrugador',
        'reciclador_confiable',
        'material_impecable',
        'cazador_de_precios',
        'embajador',
        'primer_giro',
        'cazador_de_desafios',
      ]);
      expect(lista.datos.filter((d) => d.lograda)).toHaveLength(0);
    });

    it('Semilla se entrega al completar el registro con materiales y no se repite', async () => {
      const r = await recicladorNuevo();
      expect(tiene(await insignias(r.token), 'semilla')).toBe(false);
      await put('/yo/materiales', r.token, { materiales: ['pet', 'carton'] }).expect(200);
      expect(tiene(await insignias(r.token), 'semilla')).toBe(true);
      await put('/yo/materiales', r.token, { materiales: ['pet'] }).expect(200);
      expect(await prueba.bd.usuarioInsignia.count({ where: { usuarioId: r.id } })).toBe(1);
    });

    it('Recolector, Guardián y Maestro salen de los kilos reales (200, 500 y 1000 kg)', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 199);
      let i = await insignias(r.token);
      expect(tiene(i, 'recolector')).toBe(false);
      await completada(r.id, 1);
      i = await insignias(r.token);
      expect(tiene(i, 'recolector')).toBe(true);
      expect(tiene(i, 'guardian')).toBe(false);
      await completada(r.id, 300);
      await completada(r.id, 500);
      i = await insignias(r.token);
      expect(tiene(i, 'guardian')).toBe(true);
      expect(tiene(i, 'maestro')).toBe(true);
    });

    it('ganar una insignia avisa una sola vez y la evaluación repetida no duplica nada', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 200);
      const primera = await progreso().evaluar(r.id);
      const segunda = await progreso().evaluar(r.id);
      expect(primera.insignias).toContain('recolector');
      expect(segunda.insignias).toHaveLength(0);
      const lista = (await get('/notificaciones', r.token).expect(200)).body as { datos: Array<{ titulo: string }> };
      expect(lista.datos.filter((n) => n.titulo === 'Nueva insignia: Recolector')).toHaveLength(1);
      expect(await prueba.bd.usuarioInsignia.count({ where: { usuarioId: r.id } })).toBe(1);
    });

    it('Madrugador: 5 operaciones con recepción confirmada antes de las 9:00 de Lima (08:59 sí, 09:00 no)', async () => {
      const r = await recicladorNuevo();
      // 13:59 UTC = 08:59 en Lima
      for (let i = 0; i < 4; i++) await completada(r.id, 5, { confirmadaEn: '2026-03-10T13:59:00Z' });
      await completada(r.id, 5, { confirmadaEn: '2026-03-10T14:00:00Z' });
      expect(tiene(await insignias(r.token), 'madrugador')).toBe(false);
      await completada(r.id, 5, { confirmadaEn: '2026-03-11T13:59:59Z' });
      expect(tiene(await insignias(r.token), 'madrugador')).toBe(true);
    });

    it('Cazador de precios: 5 aceptaciones de la oferta de mayor total habiendo al menos 2 ofertas', async () => {
      const r = await recicladorNuevo();
      for (let i = 0; i < 4; i++) await completada(r.id, 5, { mayorTotal: true, ofertas: 2 });
      // Mayor total, pero era la única oferta
      await completada(r.id, 5, { mayorTotal: true, ofertas: 1 });
      // Había 3 ofertas y no eligió la mayor
      await completada(r.id, 5, { mayorTotal: false, ofertas: 3 });
      expect(tiene(await insignias(r.token), 'cazador_de_precios')).toBe(false);
      await completada(r.id, 5, { mayorTotal: true, ofertas: 3 });
      expect(tiene(await insignias(r.token), 'cazador_de_precios')).toBe(true);
    });

    it('Embajador: 3 invitados que completaron su primera operación; el punto va solo a quien invitó y no se duplica', async () => {
      const invitador = await recicladorNuevo();
      const invitados = [];
      for (let i = 0; i < 3; i++) {
        const invitado = await recicladorNuevo();
        await prueba.bd.invitacion.create({ data: { invitadorId: invitador.id, invitadoId: invitado.id } });
        invitados.push(invitado);
      }
      // Aún sin operaciones completadas: no cuenta
      await progreso().evaluar(invitados[0]!.id);
      expect((await puntos(invitador.token)).puntos).toBe(0);

      for (const invitado of invitados.slice(0, 2)) {
        await completada(invitado.id, 10);
        await progreso().evaluar(invitado.id);
        await progreso().evaluar(invitado.id);
      }
      let datos = await puntos(invitador.token);
      expect(datos.puntos).toBe(20);
      expect(datos.invitacion).toMatchObject({ invitados: 3, completaron: 2, puntosGanados: 20 });
      expect(tiene(await insignias(invitador.token), 'embajador')).toBe(false);

      await completada(invitados[2]!.id, 10);
      await progreso().evaluar(invitados[2]!.id);
      expect(tiene(await insignias(invitador.token), 'embajador')).toBe(true);
      datos = await puntos(invitador.token);
      expect(datos.puntos).toBe(30);
      // El bono de invitación no cuenta para ganar giros
      const perfil = await registroDe(invitador.id);
      expect(perfil.puntos).toBe(30);
      expect(perfil.puntosReciclaje).toBe(0);
      // Quien fue invitado solo suma lo suyo
      expect((await puntos(invitados[0]!.token)).puntos).toBe(10);
    });

    it('Material impecable: 5 calificaciones con "Material limpio" o "Bien separado" (otras etiquetas no cuentan)', async () => {
      const r = await recicladorNuevo();
      const etiquetas = await prueba.bd.etiquetaCalificacion.findMany({ where: { destino: 'RECICLADOR' } });
      const id = (nombre: string) => etiquetas.find((e) => e.nombre === nombre)!.id;
      const titicacaUsuario = titicacaUsuarioId;
      async function calificar(nombre: string) {
        const { operacionId } = await completada(r.id, 5);
        const c = await prueba.bd.calificacion.create({
          data: { operacionId, autorId: titicacaUsuario, destinoId: r.id, estrellas: 5 },
        });
        await prueba.bd.calificacionEtiqueta.create({ data: { calificacionId: c.id, etiquetaId: id(nombre) } });
        return c.id;
      }
      await calificar('Material limpio');
      await calificar('Bien separado');
      await calificar('Puntual');
      await calificar('Peso correcto');
      await calificar('Material limpio');
      await calificar('Bien separado');
      // Solo 4 destacan material limpio o bien separado
      expect(tiene(await insignias(r.token), 'material_impecable')).toBe(false);
      await calificar('Bien separado');
      expect(tiene(await insignias(r.token), 'material_impecable')).toBe(true);
    });

    it('Material impecable: una reseña oculta por la administración no cuenta', async () => {
      const r = await recicladorNuevo();
      const etiqueta = await prueba.bd.etiquetaCalificacion.findFirstOrThrow({
        where: { destino: 'RECICLADOR', nombre: 'Material limpio' },
      });
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { operacionId } = await completada(r.id, 5);
        const c = await prueba.bd.calificacion.create({
          data: { operacionId, autorId: titicacaUsuarioId, destinoId: r.id, estrellas: 5 },
        });
        await prueba.bd.calificacionEtiqueta.create({ data: { calificacionId: c.id, etiquetaId: etiqueta.id } });
        ids.push(c.id);
      }
      const adminId = (await prueba.bd.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } })).id;
      await prueba.bd.resenaOculta.create({ data: { calificacionId: ids[0]!, adminId, motivo: 'Reseña ofensiva' } });
      expect(tiene(await insignias(r.token), 'material_impecable')).toBe(false);
    });

    it('Reciclador Confiable: 10 operaciones y 4,5 de calificación', async () => {
      const r = await recicladorNuevo();
      await prueba.bd.recicladorPerfil.update({
        where: { usuarioId: r.id },
        data: { operacionesCompletadas: 9, califProm: 4.8, califCant: 9 },
      });
      expect(tiene(await insignias(r.token), 'reciclador_confiable')).toBe(false);
      await prueba.bd.recicladorPerfil.update({
        where: { usuarioId: r.id },
        data: { operacionesCompletadas: 10, califProm: 4.49, califCant: 10 },
      });
      expect(tiene(await insignias(r.token), 'reciclador_confiable')).toBe(false);
      await prueba.bd.recicladorPerfil.update({ where: { usuarioId: r.id }, data: { califProm: 4.5 } });
      expect(tiene(await insignias(r.token), 'reciclador_confiable')).toBe(true);
    });

    it('Cazador de desafíos: 5 desafíos reclamados; Primer giro espera a la ruleta (10B)', async () => {
      const r = await recicladorNuevo();
      const mes = (await desafios(r.token)).mes;
      const todos = await prueba.bd.desafio.findMany({ where: { mes: new Date(`${mes}T00:00:00Z`) }, take: 5 });
      expect(todos.length).toBe(5);
      for (const d of todos.slice(0, 4)) {
        await prueba.bd.usuarioDesafio.create({
          data: { usuarioId: r.id, desafioId: d.id, completadoEn: new Date(), reclamadoEn: new Date() },
        });
      }
      expect(tiene(await insignias(r.token), 'cazador_de_desafios')).toBe(false);
      await prueba.bd.usuarioDesafio.create({
        data: { usuarioId: r.id, desafioId: todos[4]!.id, completadoEn: new Date(), reclamadoEn: new Date() },
      });
      const final = await insignias(r.token);
      expect(tiene(final, 'cazador_de_desafios')).toBe(true);
      expect(tiene(final, 'primer_giro')).toBe(false);
    });
  });

  describe('Racha de 4 semanas: operación completada o entrega directa confirmada, de lunes a domingo en Lima', () => {
    // Lunes de referencia lejanos para no mezclarse con el mes actual
    const lunes = (n: number) => new Date(Date.UTC(2026, 0, 5 + n * 7, 17, 0, 0));

    it('4 semanas seguidas dan la insignia; 3 seguidas más una suelta, no', async () => {
      const r = await recicladorNuevo();
      for (const n of [0, 1, 2, 4]) await completada(r.id, 5, { ahora: lunes(n) });
      expect(tiene(await insignias(r.token), 'racha_4_semanas')).toBe(false);
      await completada(r.id, 5, { ahora: lunes(3) });
      expect(tiene(await insignias(r.token), 'racha_4_semanas')).toBe(true);
    });

    it('una semana cuenta con 1 entrega directa confirmada', async () => {
      const r = await recicladorNuevo();
      for (const n of [0, 1, 3]) await completada(r.id, 5, { ahora: lunes(n) });
      await prueba.bd.$executeRaw`
        INSERT INTO registro_reciclaje (reciclador_id, comprador_id, material_id, kg, kg_confirmado, fecha, estado, resuelto_en, vence_en)
        VALUES (${r.id}::uuid, ${titicacaId}::uuid, (SELECT id FROM material WHERE codigo = 'metal'), 5, 5,
                '2026-01-20', 'CONFIRMADO', ${lunes(2)}, now() + interval '7 days')`;
      expect(tiene(await insignias(r.token), 'racha_4_semanas')).toBe(true);
    });

    it('el domingo 23:59 y el lunes 00:00 de Lima caen en semanas distintas', async () => {
      const r = await recicladorNuevo();
      // Dom 11-ene 23:59:59 Lima = lun 12-ene 04:59:59 UTC; Lun 12-ene 00:00 Lima = 05:00:00 UTC
      await completada(r.id, 5, { ahora: new Date('2026-01-12T04:59:59Z') });
      await completada(r.id, 5, { ahora: new Date('2026-01-12T05:00:00Z') });
      await completada(r.id, 5, { ahora: new Date('2026-01-19T12:00:00Z') });
      await completada(r.id, 5, { ahora: new Date('2026-01-26T12:00:00Z') });
      // Semanas: 5-ene, 12-ene, 19-ene, 26-ene = 4 seguidas
      expect(tiene(await insignias(r.token), 'racha_4_semanas')).toBe(true);
      const solo = await recicladorNuevo();
      await completada(solo.id, 5, { ahora: new Date('2026-01-12T04:59:59Z') });
      await completada(solo.id, 5, { ahora: new Date('2026-01-12T05:00:00Z') });
      await completada(solo.id, 5, { ahora: new Date('2026-01-19T12:00:00Z') });
      expect(tiene(await insignias(solo.token), 'racha_4_semanas')).toBe(false);
    });
  });

  describe('Desafíos mensuales (decisión 5)', () => {
    const metaDelMes = (lista: Desafio[]) => lista.find((d) => d.esMetaMes)!;

    it('el progreso sale de los datos reales y la Meta del mes pide 100 kg', async () => {
      const r = await recicladorNuevo();
      let lista = await desafios(r.token);
      expect(metaDelMes(lista.datos)).toMatchObject({ meta: 100, puntos: 30, estado: 'EN_PROGRESO', progreso: 0 });
      await completada(r.id, 60);
      lista = await desafios(r.token);
      expect(metaDelMes(lista.datos)).toMatchObject({ progreso: 60, estado: 'EN_PROGRESO' });
      expect(codigo(await post(`/yo/desafios/${metaDelMes(lista.datos).id}/reclamar`, r.token).expect(409))).toBe(
        'DESAFIO_INCOMPLETO',
      );
    });

    it('al completarlo se reclama una sola vez: +30 puntos de bonus que no cuentan para giros, más 1 giro extra', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 100);
      let lista = await desafios(r.token);
      const meta = metaDelMes(lista.datos);
      expect(meta.estado).toBe('COMPLETADO');
      const antes = await registroDe(r.id);
      expect(antes.puntosReciclaje).toBe(100);

      const reclamo = await post(`/yo/desafios/${meta.id}/reclamar`, r.token).expect(200);
      expect((reclamo.body as { puntosGanados: number }).puntosGanados).toBe(30);
      const despues = await registroDe(r.id);
      expect(despues.puntos).toBe(130);
      expect(despues.puntosReciclaje).toBe(100);
      expect(await prueba.bd.giro.count({ where: { usuarioId: r.id, origen: 'META_MES', desafioId: meta.id } })).toBe(
        1,
      );
      lista = await desafios(r.token);
      expect(metaDelMes(lista.datos).estado).toBe('RECLAMADO');

      expect(codigo(await post(`/yo/desafios/${meta.id}/reclamar`, r.token).expect(409))).toBe('DESAFIO_YA_RECLAMADO');
      expect(await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id, motivo: 'DESAFIO' } })).toBe(1);
      // El bono no sube de nivel ni suma kilos
      expect((await puntos(r.token)).kgTotal).toBe(100);
    });

    it('dos reclamos a la vez solo pagan una vez', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 100);
      const meta = metaDelMes((await desafios(r.token)).datos);
      const respuestas = await Promise.all([
        post(`/yo/desafios/${meta.id}/reclamar`, r.token),
        post(`/yo/desafios/${meta.id}/reclamar`, r.token),
      ]);
      expect(respuestas.map((x) => x.status).sort()).toEqual([200, 409]);
      expect(await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id, motivo: 'DESAFIO' } })).toBe(1);
    });

    it('el bono de un desafío no genera giros por puntos aunque cruce los 500', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 490);
      await prueba.bd.$executeRaw`DELETE FROM giro WHERE usuario_id = ${r.id}::uuid`;
      const lista = await desafios(r.token);
      const completo = lista.datos.find((d) => d.estado === 'COMPLETADO' && !d.esMetaMes);
      const meta = metaDelMes(lista.datos);
      await post(`/yo/desafios/${meta.id}/reclamar`, r.token).expect(200);
      expect(completo === undefined || completo.puntos > 0).toBe(true);
      expect(await prueba.bd.giro.count({ where: { usuarioId: r.id, origen: 'PUNTOS' } })).toBe(0);
    });

    it('completar un desafío avisa como progreso, una sola vez', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 100);
      await progreso().evaluar(r.id);
      await progreso().evaluar(r.id);
      const lista = (await get('/notificaciones', r.token).expect(200)).body as {
        datos: Array<{ tipo: string; titulo: string }>;
      };
      expect(lista.datos.filter((n) => n.tipo === 'DESAFIO' && n.titulo.includes('Recicla 100 kg'))).toHaveLength(1);
    });

    it('se reinician el día 1 a las 00:00 de Lima: lo de noviembre no cuenta en diciembre', async () => {
      const r = await recicladorNuevo();
      const servicio = prueba.app.get(JuegoService);
      await progreso().asegurarDesafiosDelMes('2026-11-01');
      // 15 de noviembre de 2026: 100 kg completados
      await completada(r.id, 100, { ahora: new Date('2026-11-15T17:00:00Z') });
      try {
        vi.useFakeTimers({ toFake: ['Date'] });
        // 30-nov 23:59:59 en Lima todavía es noviembre
        vi.setSystemTime(new Date('2026-12-01T04:59:59Z'));
        let lista = await servicio.desafios(r.id);
        expect(lista.mes).toBe('2026-11-01');
        expect(lista.datos.find((d) => d.esMetaMes)!.progreso).toBe(100);
        // 1-dic 00:00:00 en Lima: mes nuevo con progreso en cero; lo de noviembre se puede reclamar
        vi.setSystemTime(new Date('2026-12-01T05:00:00Z'));
        lista = await servicio.desafios(r.id);
        expect(lista.mes).toBe('2026-12-01');
        const nuevo = lista.datos.find((d) => d.esMetaMes && !d.delMesAnterior)!;
        expect(nuevo).toMatchObject({ progreso: 0, estado: 'EN_PROGRESO' });
        const anterior = lista.datos.find((d) => d.esMetaMes && d.delMesAnterior)!;
        expect(anterior).toMatchObject({ estado: 'COMPLETADO' });
        // Ventana de 7 días: el 7-dic a las 23:59 aún se reclama
        vi.setSystemTime(new Date('2026-12-08T04:59:59Z'));
        const reclamo = await servicio.reclamar(r.id, anterior.id);
        expect(reclamo.puntosGanados).toBe(30);
        expect((await registroDe(r.id)).puntos).toBe(130);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pasados 7 días del fin del mes ya no se puede reclamar', async () => {
      const r = await recicladorNuevo();
      const servicio = prueba.app.get(JuegoService);
      await progreso().asegurarDesafiosDelMes('2026-10-01');
      await completada(r.id, 100, { ahora: new Date('2026-10-15T17:00:00Z') });
      try {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-20T17:00:00Z'));
        const meta = (await servicio.desafios(r.id)).datos.find((d) => d.esMetaMes)!;
        expect(meta.estado).toBe('COMPLETADO');
        // 8-nov 00:00 en Lima: pasaron los 7 días (límite 7-nov)
        vi.setSystemTime(new Date('2026-11-08T05:00:00Z'));
        await expect(servicio.reclamar(r.id, meta.id)).rejects.toMatchObject({ codigo: 'DESAFIO_FUERA_DE_PLAZO' });
        expect(await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id, motivo: 'DESAFIO' } })).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Entrega directa (decisión 7, RN-15)', () => {
    const lista = async (token: string) =>
      (await get('/registros-directos/mios', token).expect(200)).body as {
        limites: { topeDiario: number; puntosHoy: number; maxPendientes: number; pendientes: number };
        datos: Entrega[];
      };
    const delNegocio = async (token = titicaca) =>
      (await get('/mi-negocio/entregas-directas', token).expect(200)).body as {
        datos: Array<Entrega & { reciclador: string }>;
      };
    const hace = (dias: number) =>
      new Date(Date.now() - dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    it('queda por confirmar sin dar puntos; el negocio confirma con los kilos que recibió y ese valor es el que cuenta', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'carton', 20).expect(201)).body as Entrega;
      expect(creada).toMatchObject({ estado: 'PENDIENTE', kg: 20, kgConfirmado: null });
      expect((await puntos(r.token)).puntos).toBe(0);

      const pendientes = (await delNegocio()).datos.filter((e) => e.id === creada.id);
      expect(pendientes).toHaveLength(1);
      expect(pendientes[0]!.reciclador).toBe('Rosa M.');
      // El negocio no recibe teléfono ni identificadores del reciclador
      expect(JSON.stringify(pendientes[0])).not.toContain(r.id);
      expect(JSON.stringify(pendientes[0])).not.toContain(r.telefono);

      const confirmada = (await confirmarEntrega(creada.id, 18).expect(200)).body as {
        puntosOtorgados: number;
        kgConfirmado: number;
      };
      expect(confirmada).toEqual({ puntosOtorgados: 18, kgConfirmado: 18 });
      const despues = await puntos(r.token);
      expect(despues.puntos).toBe(18);
      expect(despues.kgTotal).toBe(18);
      expect(despues.movimientos[0]!.descripcion).toContain('Entrega directa confirmada');
      expect((await lista(r.token)).datos[0]).toMatchObject({
        estado: 'CONFIRMADO',
        kgConfirmado: 18,
        puntosOtorgados: 18,
      });
      // No genera reseñas ni cuenta como operación completada
      expect(await prueba.bd.calificacion.count({ where: { destinoId: r.id } })).toBe(0);
      expect((await registroDe(r.id)).operacionesCompletadas).toBe(0);
    });

    it('los kilos confirmados suben de nivel y avisan', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'pet', 55).expect(201)).body as Entrega;
      await confirmarEntrega(creada.id, 55).expect(200);
      expect((await puntos(r.token)).nivel.nombre).toBe('Brote');
      const avisos = (await get('/notificaciones', r.token).expect(200)).body as {
        datos: Array<{ tipo: string; titulo: string }>;
      };
      expect(avisos.datos.some((n) => n.tipo === 'NIVEL' && n.titulo.includes('Brote'))).toBe(true);
      expect(avisos.datos.some((n) => n.titulo === 'Confirmaron tu entrega directa')).toBe(true);
    });

    it('tope de 150 puntos por día: los kilos cuentan completos, los puntos se recortan y luego no suman', async () => {
      const r = await recicladorNuevo();
      const a = (await entregaDirecta(r.token, 'pet', 100).expect(201)).body as Entrega;
      const b = (await entregaDirecta(r.token, 'carton', 100).expect(201)).body as Entrega;
      const c = (await entregaDirecta(r.token, 'metal', 100).expect(201)).body as Entrega;
      expect((await confirmarEntrega(a.id, 100).expect(200)).body).toMatchObject({ puntosOtorgados: 100 });
      expect((await confirmarEntrega(b.id, 100).expect(200)).body).toMatchObject({ puntosOtorgados: 50 });
      expect((await confirmarEntrega(c.id, 100).expect(200)).body).toMatchObject({ puntosOtorgados: 0 });
      const datos = await puntos(r.token);
      expect(datos.puntos).toBe(150);
      expect(datos.kgTotal).toBe(300);
      expect(datos.nivel.nombre).toBe('Recolector');
      expect(await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id, motivo: 'REGISTRO_DIRECTO' } })).toBe(
        2,
      );
      expect((await lista(r.token)).limites).toMatchObject({ topeDiario: 150, puntosHoy: 150 });
    });

    it('máximo 3 pendientes; el cuarto se rechaza hasta que el negocio resuelva alguno', async () => {
      const r = await recicladorNuevo();
      for (const material of ['pet', 'carton', 'metal']) await entregaDirecta(r.token, material, 5).expect(201);
      expect(codigo(await entregaDirecta(r.token, 'papel', 5).expect(409))).toBe('LIMITE_PENDIENTES');
      const primera = (await lista(r.token)).datos.find((d) => d.estado === 'PENDIENTE')!;
      await post(`/mi-negocio/entregas-directas/${primera.id}/rechazar`, titicaca, {
        motivo: 'No recibí ese material.',
      }).expect(200);
      await entregaDirecta(r.token, 'papel', 5).expect(201);
    });

    it('no se registra dos veces lo mismo el mismo día', async () => {
      const r = await recicladorNuevo();
      await entregaDirecta(r.token, 'pet', 10).expect(201);
      expect(codigo(await entregaDirecta(r.token, 'pet', 10).expect(409))).toBe('ENTREGA_DUPLICADA');
      await entregaDirecta(r.token, 'pet', 10, { fecha: hace(1) }).expect(201);
    });

    it('vence a los 7 días sin dar puntos', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'pet', 10).expect(201)).body as Entrega;
      const detalle = await prueba.bd.registroReciclaje.findUniqueOrThrow({ where: { id: creada.id } });
      expect(detalle.venceEn.getTime() - detalle.creadoEn.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
      const entregas = prueba.app.get((await import('../src/modulos/juego/entregas.service.js')).EntregasService);
      expect(await entregas.vencerPendientes(new Date(Date.now() + 8 * 86_400_000), r.id)).toBe(1);
      expect((await lista(r.token)).datos[0]).toMatchObject({ estado: 'VENCIDO', puntosOtorgados: 0 });
      expect(codigo(await confirmarEntrega(creada.id, 10).expect(409))).toBe('ENTREGA_YA_RESUELTA');
      expect((await puntos(r.token)).puntos).toBe(0);
    });

    it('confirmar fuera de plazo la deja vencida y sin puntos', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'carton', 10).expect(201)).body as Entrega;
      await prueba.bd.registroReciclaje.update({
        where: { id: creada.id },
        data: { venceEn: new Date(Date.now() - 1000) },
      });
      expect(codigo(await confirmarEntrega(creada.id, 10).expect(409))).toBe('ENTREGA_VENCIDA');
      expect((await lista(r.token)).datos[0]!.estado).toBe('VENCIDO');
      expect((await puntos(r.token)).puntos).toBe(0);
    });

    it('rechazar no da puntos, avisa con el motivo y no se puede resolver dos veces', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'metal', 8).expect(201)).body as Entrega;
      expect(
        codigo(
          await post(`/mi-negocio/entregas-directas/${creada.id}/rechazar`, titicaca, { motivo: 'no' }).expect(400),
        ),
      ).toBe('ENTRADA_NO_VALIDA');
      await post(`/mi-negocio/entregas-directas/${creada.id}/rechazar`, titicaca, {
        motivo: 'No recibí ese material.',
      }).expect(200);
      expect((await lista(r.token)).datos[0]).toMatchObject({
        estado: 'RECHAZADO',
        motivoRechazo: 'No recibí ese material.',
      });
      expect(codigo(await confirmarEntrega(creada.id, 8).expect(409))).toBe('ENTREGA_YA_RESUELTA');
      expect((await puntos(r.token)).puntos).toBe(0);
      const avisos = (await get('/notificaciones', r.token).expect(200)).body as {
        datos: Array<{ titulo: string; mensaje: string }>;
      };
      expect(
        avisos.datos.some((n) => n.titulo === 'Rechazaron tu entrega directa' && n.mensaje.includes('No recibí')),
      ).toBe(true);
    });

    it('dos confirmaciones a la vez solo suman una vez', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'pet', 40).expect(201)).body as Entrega;
      const respuestas = await Promise.all([confirmarEntrega(creada.id, 40), confirmarEntrega(creada.id, 40)]);
      expect(respuestas.map((x) => x.status).sort()).toEqual([200, 409]);
      expect((await puntos(r.token)).puntos).toBe(40);
      expect(await prueba.bd.movimientoPuntos.count({ where: { usuarioId: r.id } })).toBe(1);
    });

    it('validación y permisos: solo el negocio dueño confirma y solo el reciclador registra', async () => {
      const r = await recicladorNuevo();
      expect(codigo(await entregaDirecta(r.token, 'pet', 0).expect(400))).toBe('ENTRADA_NO_VALIDA');
      await entregaDirecta(r.token, 'pet', 6000).expect(400);
      await entregaDirecta(r.token, 'oro', 10).expect(400);
      expect(codigo(await entregaDirecta(r.token, 'pet', 10, { fecha: hace(-2) }).expect(422))).toBe('FECHA_NO_VALIDA');
      expect(codigo(await entregaDirecta(r.token, 'pet', 10, { fecha: hace(9) }).expect(422))).toBe('FECHA_NO_VALIDA');
      await post('/registros-directos', r.token, {
        compradorId: '00000000-0000-4000-8000-000000000000',
        material: 'pet',
        kg: 5,
      }).expect(404);
      const creada = (await entregaDirecta(r.token, 'papel', 10).expect(201)).body as Entrega;

      await post('/registros-directos', titicaca, { compradorId: titicacaId, material: 'pet', kg: 5 }).expect(403);
      await post('/registros-directos', admin, { compradorId: titicacaId, material: 'pet', kg: 5 }).expect(403);
      await http().post('/api/v1/registros-directos').send({}).expect(401);
      await confirmarEntrega(creada.id, 10, r.token).expect(403);
      await confirmarEntrega(creada.id, 10, admin).expect(403);
      // Otro negocio no ve ni confirma entregas ajenas
      await confirmarEntrega(creada.id, 10, ruben).expect(404);
      expect((await delNegocio(ruben)).datos.some((e) => e.id === creada.id)).toBe(false);
      await confirmarEntrega(creada.id, 6000).expect(400);
      await confirmarEntrega(creada.id, 0).expect(400);
    });

    it('la lista de negocios para elegir trae solo datos públicos de los verificados de su ciudad', async () => {
      const r = await recicladorNuevo();
      const lista = (await get('/registros-directos/negocios', r.token).expect(200)).body as {
        datos: Array<Record<string, unknown>>;
      };
      expect(lista.datos.some((n) => n.nombre === 'Acopio Titicaca')).toBe(true);
      expect(lista.datos.every((n) => Object.keys(n).sort().join() === 'id,nombre,tipo,zona')).toBe(true);
      // Los centros por verificar no aparecen
      expect(lista.datos.some((n) => n.nombre === 'Reciclajes Sur')).toBe(false);
      await get('/registros-directos/negocios', titicaca).expect(403);
    });

    it('un reciclador ve solo sus entregas', async () => {
      const a = await recicladorNuevo();
      const b = await recicladorNuevo();
      await entregaDirecta(a.token, 'pet', 10).expect(201);
      expect((await lista(b.token)).datos).toHaveLength(0);
    });

    it('cuentan para la racha y para los desafíos de kilos del mes', async () => {
      const r = await recicladorNuevo();
      const creada = (await entregaDirecta(r.token, 'pet', 100).expect(201)).body as Entrega;
      await confirmarEntrega(creada.id, 100).expect(200);
      const meta = (await desafios(r.token)).datos.find((d) => d.esMetaMes)!;
      expect(meta).toMatchObject({ progreso: 100, estado: 'COMPLETADO' });
    });

    it('las alertas de colusión también cuentan las entregas directas y piden revisar kilos confirmados de más', async () => {
      const r = await recicladorNuevo();
      const ids: string[] = [];
      for (const material of ['pet', 'carton', 'metal']) {
        const e = (await entregaDirecta(r.token, material, 10).expect(201)).body as Entrega;
        ids.push(e.id);
      }
      // El negocio confirma el doble de lo registrado: recibido mayor que registrado
      await confirmarEntrega(ids[0]!, 20).expect(200);
      await confirmarEntrega(ids[1]!, 10).expect(200);
      await confirmarEntrega(ids[2]!, 10).expect(200);
      const alertas = (await get('/admin/alertas?dias=30', admin).expect(200)).body as {
        pares: Array<{ clave: string; operacionesEn7Dias: number; operaciones: Array<{ origen: string }> }>;
        pesos: Array<{ clave: string; origen: string; desvioPct: number }>;
      };
      const par = alertas.pares.find((p) => p.clave === `${r.id}:${titicacaId}`);
      expect(par).toBeDefined();
      expect(par!.operacionesEn7Dias).toBeGreaterThanOrEqual(3);
      expect(par!.operaciones.every((o) => o.origen === 'DIRECTA')).toBe(true);
      const peso = alertas.pesos.find((p) => p.clave === ids[0]);
      expect(peso).toMatchObject({ origen: 'DIRECTA', desvioPct: 100 });
      // Solo alerta: no bloquea nada y la administración puede descartarla con motivo
      expect((await puntos(r.token)).puntos).toBe(40);
      await post('/admin/alertas/descartar', admin, {
        tipo: 'PESO',
        clave: ids[0],
        motivo: 'Se pesó de nuevo y fue correcto.',
      }).expect(200);
      const despues = (await get('/admin/alertas?dias=30', admin).expect(200)).body as {
        pesos: Array<{ clave: string }>;
      };
      expect(despues.pesos.some((p) => p.clave === ids[0])).toBe(false);
    });
  });

  describe('Ranking (decisión 6)', () => {
    type Ranking = {
      alcance: string;
      ciudad: string;
      filas: Array<{ posicion: number; nombre: string; nivel: string; kg: number; esYo: boolean }>;
      yo: { visible: boolean; posicion: number | null; faltan: number | null };
    };
    const ranking = async (token: string, alcance = 'mes') =>
      (await get(`/ranking?alcance=${alcance}`, token).expect(200)).body as Ranking;

    it('ordena por kilos, muestra nombre abreviado y nivel, y no expone identificadores ni datos personales', async () => {
      const a = await recicladorNuevo();
      const b = await recicladorNuevo();
      await completada(a.id, 31);
      await completada(b.id, 83);
      const deA = await ranking(a.token);
      const deB = await ranking(b.token);
      expect(deB.yo.posicion).not.toBeNull();
      expect(deB.yo.posicion!).toBeLessThan(deA.yo.posicion!);
      expect(deA.yo.faltan).not.toBeNull();
      expect(deA.ciudad).toBe('Juliaca');
      const fila = deB.filas.find((f) => f.esYo) ?? deB.filas[0]!;
      expect(Object.keys(fila).sort()).toEqual(['esYo', 'kg', 'nivel', 'nombre', 'posicion']);
      expect(deB.filas.every((f) => /^[^\s]+( [A-ZÁÉÍÓÚÑ]\.)?$/.test(f.nombre))).toBe(true);
      const texto = JSON.stringify([deA, deB]);
      for (const secreto of [a.id, b.id, a.telefono, b.telefono, 'Mamani Quispe']) expect(texto).not.toContain(secreto);
    });

    it('quien se oculta no aparece y sigue sumando puntos; puede volver a aparecer', async () => {
      const a = await recicladorNuevo();
      const b = await recicladorNuevo();
      await completada(a.id, 50);
      await completada(b.id, 120);
      const antes = await ranking(a.token);
      expect(antes.yo.posicion).not.toBeNull();
      await put('/yo/preferencias', b.token, { visibleEnRanking: false }).expect(200);
      const deB = await ranking(b.token);
      expect(deB.yo).toMatchObject({ visible: false, posicion: null });
      const despues = await ranking(a.token);
      expect(despues.yo.posicion!).toBeLessThan(antes.yo.posicion! + 1);
      expect(despues.filas.reduce((suma, f) => suma + f.kg, 0)).toBeLessThanOrEqual(
        antes.filas.reduce((suma, f) => suma + f.kg, 0),
      );
      expect((await puntos(b.token)).puntos).toBe(120);
      await put('/yo/preferencias', b.token, { visibleEnRanking: true }).expect(200);
      expect((await ranking(b.token)).yo.posicion).not.toBeNull();
    });

    it('el total acumulado usa los kilos de siempre y el del mes solo los del mes', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 70, { ahora: new Date('2025-06-10T17:00:00Z') });
      await completada(r.id, 5);
      const mes = await ranking(r.token, 'mes');
      const total = await ranking(r.token, 'acumulado');
      const kgMes = (mes.filas.find((f) => f.esYo) ?? null)?.kg;
      const kgTotal = (total.filas.find((f) => f.esYo) ?? null)?.kg;
      if (kgMes !== undefined && kgMes !== null) expect(kgMes).toBe(5);
      if (kgTotal !== undefined && kgTotal !== null) expect(kgTotal).toBe(75);
      expect(total.yo.posicion).not.toBeNull();
    });

    it('permisos y validación: solo recicladores; el alcance y la ciudad se validan', async () => {
      const r = await recicladorNuevo();
      await get('/ranking', titicaca).expect(403);
      await get('/ranking', admin).expect(403);
      await http().get('/api/v1/ranking').expect(401);
      await get('/ranking?alcance=siempre', r.token).expect(400);
      await get('/ranking?ciudad=32000', r.token).expect(404);
    });
  });

  describe('Pantalla de perfil (14)', () => {
    it('trae nivel, kilos, operaciones, insignias especiales y el historial sin datos de otros', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 12);
      const camino = (await get('/yo/camino', r.token).expect(200)).body as {
        nivel: { nombre: string };
        kgTotal: number;
        operaciones: number;
        especiales: Array<{ codigo: string }>;
        historial: Array<{ negocio: string; kg: number }>;
      };
      expect(camino).toMatchObject({ kgTotal: 12, operaciones: 1, nivel: { nombre: 'Semilla' } });
      expect(camino.especiales.map((e) => e.codigo).sort()).toEqual([
        'cazador_de_precios',
        'embajador',
        'racha_4_semanas',
        'reciclador_confiable',
      ]);
      expect(camino.historial).toEqual([expect.objectContaining({ kg: 12, negocio: 'Acopio Titicaca' })]);
      await get('/yo/camino', titicaca).expect(403);
    });
  });
});
