import { ADMIN } from '../prisma/datos-semilla.js';
import { OperacionesTareas } from '../src/modulos/operaciones/operaciones-tareas.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';
import { cerrarConexiones, crearOferta, crearPublicacion, propietario } from './bd/apoyo.js';

type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const HORA = 3_600_000;

describe('Ajustes de la 12B: plazos propios de cada operación y entrega directa con cuenta suspendida', () => {
  let prueba: Prueba;
  let admin: string;
  let titicaca: string;
  let titicacaId: string;
  const originales = new Map<string, string>();

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    titicaca = await entrar(prueba, '900000011');
    titicacaId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } })).id;
  });
  afterAll(async () => {
    for (const [clave, valor] of originales) {
      await propietario.query('UPDATE parametro SET valor = $2::text WHERE clave = $1::text', [clave, valor]);
    }
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  async function recicladorNuevo() {
    const tel = telefono();
    const token = await nuevoReciclador(prueba, tel, 'Rosa Mamani Quispe');
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    return { token, id: usuario.id };
  }
  async function cambiarParametro(clave: string, valor: number) {
    if (!originales.has(clave)) {
      originales.set(
        clave,
        (await propietario.query('SELECT valor FROM parametro WHERE clave = $1', [clave])).rows[0].valor as string,
      );
    }
    await prueba
      .http()
      .put(`/api/v1/admin/parametros/${clave}`)
      .set(bearer(admin))
      .send({ valor, motivo: 'Prueba de plazos por operación' })
      .expect(200);
  }
  async function operacionHasta(estado: 'ENTREGADA' | 'CONFIRMADA') {
    const r = await recicladorNuevo();
    const publicacionId = await crearPublicacion(r.id, { codigoMaterial: 'pet', kg: 20 });
    const ofertaId = await crearOferta(publicacionId, titicacaId);
    await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [ofertaId]);
    await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacionId]);
    const nueva = await propietario.query(
      'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [publicacionId, ofertaId, r.id, titicacaId],
    );
    const id = nueva.rows[0].id as string;
    for (const e of ['EN_COORDINACION', 'ENTREGADA'])
      await propietario.query('UPDATE operacion SET estado = $2 WHERE id = $1', [id, e]);
    if (estado === 'CONFIRMADA') {
      await propietario.query(
        "UPDATE operacion SET estado = 'CONFIRMADA', kg_final = 20, monto_final = 50, confirmada_en = now() WHERE id = $1",
        [id],
      );
    }
    return id;
  }
  const filaPlazos = async (id: string) =>
    (
      await propietario.query(
        'SELECT plazo_aviso_entrega_horas AS e, plazo_conformidad_horas AS c FROM operacion WHERE id = $1',
        [id],
      )
    ).rows[0] as { e: number | null; c: number | null };

  it('el cierre automático no baja de 48 horas', async () => {
    await prueba
      .http()
      .put('/api/v1/admin/parametros/plazo_conformidad_horas')
      .set(bearer(admin))
      .send({ valor: 24, motivo: 'Prueba del mínimo' })
      .expect(422);
  });

  it('un cambio de plazo aplica solo a las operaciones nuevas: el cierre automático', async () => {
    const antigua = await operacionHasta('CONFIRMADA');
    expect((await filaPlazos(antigua)).c).toBe(72);
    await cambiarParametro('plazo_conformidad_horas', 48);
    const nueva = await operacionHasta('CONFIRMADA');
    expect((await filaPlazos(nueva)).c).toBe(48);
    for (const id of [antigua, nueva]) {
      await propietario.query("UPDATE operacion SET confirmada_en = now() - interval '60 hours' WHERE id = $1", [id]);
    }
    await prueba.app.get(OperacionesTareas).cerrarVencidas();
    const estados = async (id: string) => (await prueba.bd.operacion.findUniqueOrThrow({ where: { id } })).estado;
    // La antigua conserva sus 72 h; la nueva ya cumplió sus 48 h
    expect(await estados(antigua)).toBe('CONFIRMADA');
    expect(await estados(nueva)).toBe('COMPLETADA');
  });

  it('un cambio de plazo aplica solo a las operaciones nuevas: el aviso por entrega sin confirmar', async () => {
    const antigua = await operacionHasta('ENTREGADA');
    expect((await filaPlazos(antigua)).e).toBe(72);
    await cambiarParametro('plazo_aviso_entrega_horas', 48);
    const nueva = await operacionHasta('ENTREGADA');
    expect((await filaPlazos(nueva)).e).toBe(48);
    for (const id of [antigua, nueva]) {
      await propietario.query("UPDATE operacion SET entregada_en = now() - interval '60 hours' WHERE id = $1", [id]);
    }
    await prueba.app.get(OperacionesTareas).avisarSinConfirmar();
    const aviso = async (id: string) => (await prueba.bd.operacion.findUniqueOrThrow({ where: { id } })).avisoEntregaEn;
    expect(await aviso(antigua)).toBeNull();
    expect(await aviso(nueva)).not.toBeNull();
    expect(Date.now() - (await aviso(nueva))!.getTime()).toBeLessThan(HORA);
  });

  it('una cuenta suspendida no puede confirmar una entrega directa; la confirma al reactivarse', async () => {
    const r = await recicladorNuevo();
    const creada = (
      await post('/registros-directos', r.token, { compradorId: titicacaId, material: 'pet', kg: 12 }).expect(201)
    ).body as { id: string };
    const suspender = (id: string) =>
      post(`/admin/usuarios/${id}/suspender`, admin, {
        motivo: 'Información falsa',
        nota: 'Prueba de la fase',
        confirmar: true,
      });
    await suspender(r.id).expect(200);
    try {
      expect(
        codigo(await post(`/mi-negocio/entregas-directas/${creada.id}/confirmar`, titicaca, { kg: 12 }).expect(409)),
      ).toBe('CONTRAPARTE_SUSPENDIDA');
      expect((await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: r.id } })).puntos).toBe(0);
    } finally {
      await post(`/admin/usuarios/${r.id}/reactivar`, admin, { motivo: 'Aclaró lo ocurrido', confirmar: true }).expect(
        200,
      );
    }
    await post(`/mi-negocio/entregas-directas/${creada.id}/confirmar`, titicaca, { kg: 12 }).expect(200);
    expect((await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: r.id } })).puntos).toBe(12);
  });
});
