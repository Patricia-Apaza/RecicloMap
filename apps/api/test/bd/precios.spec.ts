import {
  administrador,
  api,
  cerrarConexiones,
  codigoDeError,
  material,
  negocio,
  propietario,
  RESTRICCION,
} from './apoyo.js';

describe('Precios y demanda', () => {
  let compradorId: string;
  let duenoId: string;
  let papelId: number;

  beforeAll(async () => {
    ({ id: compradorId, usuarioId: duenoId } = await negocio('Compras Rubén'));
    papelId = await material('papel');
  });
  afterAll(cerrarConexiones);

  const alta = (min: number | null, max: number | null, autor: string, materialId = papelId) =>
    api.query(
      'INSERT INTO precio_material (comprador_id, material_id, precio_min, precio_max, actualizado_por_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [compradorId, materialId, min, max, autor],
    );

  it('el rango es obligatorio', async () => {
    expect(await codigoDeError(alta(null, 0.5, duenoId))).toBe('23502');
    expect(await codigoDeError(alta(0.3, null, duenoId))).toBe('23502');
  });

  it('el mínimo no puede superar al máximo', async () => {
    expect(await codigoDeError(alta(0.6, 0.5, duenoId))).toBe(RESTRICCION);
  });

  it('el precio debe estar entre S/ 0.10 y S/ 50.00', async () => {
    expect(await codigoDeError(alta(0.09, 0.5, duenoId))).toBe('RM002');
    expect(await codigoDeError(alta(0.3, 50.01, duenoId))).toBe('RM002');
    expect(await codigoDeError(alta(0, 0.5, duenoId))).toBe('RM002');
  });

  it('acepta los límites exactos y un rango válido', async () => {
    const plastico = await material('plastico');
    expect(await codigoDeError(alta(0.1, 50, duenoId, plastico))).toBeUndefined();
    expect(await codigoDeError(alta(0.3, 0.4, duenoId))).toBeUndefined();
  });

  it('los límites se leen de los parámetros del administrador', async () => {
    await propietario.query("UPDATE parametro SET valor = '60.00' WHERE clave = 'precio_kg_maximo'");
    const subir = api.query('UPDATE precio_material SET precio_max = 55 WHERE comprador_id = $1 AND material_id = $2', [
      compradorId,
      await material('metal'),
    ]);
    expect(await codigoDeError(subir)).toBeUndefined();
    await propietario.query(
      'UPDATE precio_material SET precio_max = 2.7 WHERE comprador_id = $1 AND material_id = $2',
      [compradorId, await material('metal')],
    );
    await propietario.query("UPDATE parametro SET valor = '50.00' WHERE clave = 'precio_kg_maximo'");
  });

  it('solo el dueño del negocio puede fijar o cambiar su precio', async () => {
    const otro = await negocio('Acopio Titicaca');
    const adminId = await administrador();
    const cambiar = (autor: string) =>
      api.query(
        'UPDATE precio_material SET precio_max = 2.65, actualizado_por_id = $1 WHERE comprador_id = $2 AND material_id = $3',
        [autor, compradorId, papelId],
      );
    expect(await codigoDeError(cambiar(adminId))).toBe('RM001');
    expect(await codigoDeError(cambiar(otro.usuarioId))).toBe('RM001');
  });

  it('cada cambio de precio queda en el historial con su autor', async () => {
    const antes = await propietario.query(
      'SELECT count(*)::int AS total FROM historial_precio h JOIN precio_material p ON p.id = h.precio_material_id WHERE p.comprador_id = $1 AND p.material_id = $2',
      [compradorId, papelId],
    );
    await api.query(
      'UPDATE precio_material SET precio_min = 0.32, precio_max = 0.42, actualizado_por_id = $1 WHERE comprador_id = $2 AND material_id = $3',
      [duenoId, compradorId, papelId],
    );
    const despues = await propietario.query(
      `SELECT h.precio_min, h.precio_max, h.autor_id FROM historial_precio h JOIN precio_material p ON p.id = h.precio_material_id
        WHERE p.comprador_id = $1 AND p.material_id = $2 ORDER BY h.id DESC`,
      [compradorId, papelId],
    );
    expect(despues.rowCount).toBe(antes.rows[0].total + 1);
    expect(despues.rows[0]).toEqual({ precio_min: '0.32', precio_max: '0.42', autor_id: duenoId });
  });

  it('en el historial nunca figura un administrador', async () => {
    const resultado = await propietario.query(
      "SELECT count(*)::int AS total FROM historial_precio h JOIN usuario u ON u.id = h.autor_id WHERE u.rol = 'ADMIN'",
    );
    expect(resultado.rows[0].total).toBe(0);
    const todos = await propietario.query(
      `SELECT count(*)::int AS ajenos FROM historial_precio h
         JOIN precio_material p ON p.id = h.precio_material_id
         JOIN comprador c ON c.id = p.comprador_id
        WHERE h.autor_id <> c.usuario_id`,
    );
    expect(todos.rows[0].ajenos).toBe(0);
  });

  it('la demanda cambia sin tocar el precio ni generar historial', async () => {
    const consulta = `SELECT p.precio_min, p.precio_max, p.demanda, (SELECT count(*)::int FROM historial_precio h WHERE h.precio_material_id = p.id) AS cambios
                        FROM precio_material p WHERE p.comprador_id = $1 AND p.material_id = $2`;
    const antes = (await propietario.query(consulta, [compradorId, papelId])).rows[0];
    await api.query("UPDATE precio_material SET demanda = 'ALTA' WHERE comprador_id = $1 AND material_id = $2", [
      compradorId,
      papelId,
    ]);
    const despues = (await propietario.query(consulta, [compradorId, papelId])).rows[0];
    expect(despues).toEqual({ ...antes, demanda: 'ALTA' });
  });

  it('la demanda solo admite Alta, Media o Baja', async () => {
    const invalida = api.query("UPDATE precio_material SET demanda = 'URGENTE' WHERE comprador_id = $1", [compradorId]);
    expect(await codigoDeError(invalida)).toBe('22P02');
  });

  it('el precio esperado de una publicación y el de una oferta respetan los mismos límites', async () => {
    const publicacion = await propietario.query('SELECT id FROM publicacion LIMIT 1');
    if (publicacion.rowCount) {
      const fuera = propietario.query('UPDATE publicacion SET precio_esperado = 80 WHERE id = $1', [
        publicacion.rows[0].id,
      ]);
      expect(await codigoDeError(fuera)).toBe('RM002');
    }
    const validacion = propietario.query('SELECT validar_precio_kg(0.05)');
    expect(await codigoDeError(validacion)).toBe('RM002');
  });
});
