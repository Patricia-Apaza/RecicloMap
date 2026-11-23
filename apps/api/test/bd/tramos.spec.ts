import { api, cerrarConexiones, crearPublicacion, crearReciclador, negocio, propietario } from './apoyo.js';

const ETIQUETAS = ['menos de 1 km', '1–2 km', '2–5 km', 'más de 5 km'];

describe('Distancia por tramos', () => {
  let publicacion: string;

  beforeAll(async () => {
    publicacion = await crearPublicacion(await crearReciclador());
  });
  afterAll(cerrarConexiones);

  it.each([
    [0, 'menos de 1 km'],
    [999.9, 'menos de 1 km'],
    [1000, '1–2 km'],
    [1999.9, '1–2 km'],
    [2000, '2–5 km'],
    [5000, '2–5 km'],
    [5000.1, 'más de 5 km'],
    [250000, 'más de 5 km'],
  ])('%p metros corresponde a "%s"', async (metros, etiqueta) => {
    const resultado = await propietario.query('SELECT tramo_de_metros($1)::text AS tramo', [metros]);
    expect(resultado.rows[0].tramo).toBe(etiqueta);
  });

  it('las funciones devuelven el tipo enumerado de tramo, no un número', async () => {
    const resultado = await propietario.query(
      `SELECT p.proname, t.typname FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype
        WHERE p.proname IN ('tramo_de_metros', 'publicacion_tramo')`,
    );
    expect(resultado.rows).toHaveLength(2);
    for (const fila of resultado.rows) {
      expect(fila.typname).toBe('tramo_distancia');
    }
    const columnas = await propietario.query(
      "SELECT pg_get_function_result(oid) AS salida FROM pg_proc WHERE proname = 'publicaciones_cercanas'",
    );
    expect(columnas.rows[0].salida).toBe('TABLE(publicacion_id uuid, tramo tramo_distancia)');
  });

  it.each([
    ['Compras Rubén', 'menos de 1 km'],
    ['Acopio Titicaca', '1–2 km'],
    ['Acopio Cerro Colorado', '2–5 km'],
    ['Recicla Puno Sur', 'más de 5 km'],
  ])('la API recibe el tramo hacia %s: "%s"', async (nombre, etiqueta) => {
    const { id } = await negocio(nombre);
    const resultado = await api.query('SELECT publicacion_tramo($1, $2)::text AS tramo', [publicacion, id]);
    expect(resultado.rows[0].tramo).toBe(etiqueta);
  });

  it('las publicaciones cercanas de un negocio traen solo identificador y tramo', async () => {
    const { id } = await negocio('Acopio Titicaca');
    const resultado = await api.query('SELECT * FROM publicaciones_cercanas($1)', [id]);
    expect(resultado.rowCount).toBeGreaterThan(0);
    expect(resultado.fields.map((campo) => campo.name)).toEqual(['publicacion_id', 'tramo']);
    for (const fila of resultado.rows) {
      expect(ETIQUETAS).toContain(fila.tramo);
    }
    const propia = resultado.rows.find((fila) => fila.publicacion_id === publicacion);
    expect(propia?.tramo).toBe('1–2 km');
  });

  it('un negocio no verificado no recibe publicaciones cercanas', async () => {
    const { id } = await negocio('EcoAcopio Juliaca');
    await propietario.query("UPDATE comprador SET estado_verificacion = 'EN_REVISION' WHERE id = $1", [id]);
    const resultado = await api.query('SELECT * FROM publicaciones_cercanas($1)', [id]);
    await propietario.query("UPDATE comprador SET estado_verificacion = 'APROBADO' WHERE id = $1", [id]);
    expect(resultado.rowCount).toBe(0);
  });

  it('una publicación que ya no está abierta deja de aparecer', async () => {
    const cerrada = await crearPublicacion(await crearReciclador());
    await propietario.query(
      "UPDATE publicacion SET estado = 'CANCELADA', motivo_cancelacion = 'Prueba' WHERE id = $1",
      [cerrada],
    );
    const { id } = await negocio('Acopio Titicaca');
    const resultado = await api.query('SELECT publicacion_id FROM publicaciones_cercanas($1)', [id]);
    expect(resultado.rows.map((fila) => fila.publicacion_id)).not.toContain(cerrada);
  });
});
