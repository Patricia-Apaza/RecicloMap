import {
  avanzarOperacion,
  cerrarConexiones,
  codigoDeError,
  crearOferta,
  crearOperacion,
  crearPublicacion,
  crearReciclador,
  material,
  negocio,
  propietario,
  UNICO,
} from './apoyo.js';

describe('Reglas de unicidad', () => {
  afterAll(cerrarConexiones);

  it('una sola operación por publicación', async () => {
    const { publicacionId, recicladorId } = await crearOperacion();
    const otro = await negocio('EcoAcopio Juliaca');
    const oferta = await propietario.query(
      'INSERT INTO oferta (publicacion_id, comprador_id, precio_kg, total, actualizada_en) VALUES ($1, $2, 2.4, 1, now()) RETURNING id',
      [publicacionId, otro.id],
    );
    const segunda = propietario.query(
      'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4)',
      [publicacionId, oferta.rows[0].id, recicladorId, otro.id],
    );
    expect(await codigoDeError(segunda)).toBe(UNICO);
  });

  it('una sola operación por oferta', async () => {
    const { publicacionId, ofertaId, recicladorId, compradorId } = await crearOperacion();
    const repetida = propietario.query(
      'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4)',
      [publicacionId, ofertaId, recicladorId, compradorId],
    );
    expect(await codigoDeError(repetida)).toBe(UNICO);
  });

  it('la operación debe coincidir con su oferta y su publicación', async () => {
    const reciclador = await crearReciclador();
    const publicacion = await crearPublicacion(reciclador);
    const otra = await crearPublicacion(reciclador);
    const { id: compradorId } = await negocio('Acopio Titicaca');
    const oferta = await crearOferta(publicacion, compradorId);
    const cruzada = propietario.query(
      'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4)',
      [otra, oferta, reciclador, compradorId],
    );
    expect(await codigoDeError(cruzada)).toBe('RM013');
  });

  it('una calificación por autor y operación', async () => {
    const { operacionId, recicladorId, negocioUsuarioId } = await crearOperacion();
    await avanzarOperacion(operacionId, 'COMPLETADA');
    const calificar = (autor: string, destino: string) =>
      propietario.query(
        'INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas) VALUES ($1, $2, $3, 5)',
        [operacionId, autor, destino],
      );
    await calificar(recicladorId, negocioUsuarioId);
    expect(await codigoDeError(calificar(recicladorId, negocioUsuarioId))).toBe(UNICO);
    expect(await codigoDeError(calificar(negocioUsuarioId, recicladorId))).toBeUndefined();
  });

  it('un movimiento de puntos por operación y motivo', async () => {
    const { operacionId, recicladorId } = await crearOperacion();
    await avanzarOperacion(operacionId, 'COMPLETADA');
    const sumar = () =>
      propietario.query(
        "INSERT INTO movimiento_puntos (usuario_id, puntos, motivo, cuenta_para_giros, operacion_id) VALUES ($1, 34, 'OPERACION', true, $2)",
        [recicladorId, operacionId],
      );
    await sumar();
    expect(await codigoDeError(sumar())).toBe(UNICO);
  });

  it('una oferta vigente por negocio y publicación', async () => {
    const publicacion = await crearPublicacion(await crearReciclador());
    const { id: compradorId } = await negocio('Acopio Cerro Colorado');
    await crearOferta(publicacion, compradorId);
    expect(await codigoDeError(crearOferta(publicacion, compradorId, 2.6))).toBe(UNICO);
  });

  it('se puede volver a ofertar tras retirar, pero no tras ser rechazado', async () => {
    const publicacion = await crearPublicacion(await crearReciclador());
    const { id: compradorId } = await negocio('Acopio Cerro Colorado');
    const primera = await crearOferta(publicacion, compradorId);
    await propietario.query("UPDATE oferta SET estado = 'RETIRADA' WHERE id = $1", [primera]);
    const segunda = await crearOferta(publicacion, compradorId, 2.6);
    await propietario.query("UPDATE oferta SET estado = 'RECHAZADA' WHERE id = $1", [segunda]);
    expect(await codigoDeError(crearOferta(publicacion, compradorId, 2.7))).toBe(UNICO);
  });

  it('un registro directo no se duplica para el mismo negocio, material y fecha', async () => {
    const reciclador = await crearReciclador();
    const { id: compradorId } = await negocio('Compras Rubén');
    const registrar = async () =>
      propietario.query(
        'INSERT INTO registro_reciclaje (reciclador_id, comprador_id, material_id, kg, fecha) VALUES ($1, $2, $3, 12, CURRENT_DATE)',
        [reciclador, compradorId, await material('pet')],
      );
    await registrar();
    expect(await codigoDeError(registrar())).toBe(UNICO);
    await propietario.query(
      "UPDATE registro_reciclaje SET estado = 'RECHAZADO', motivo_rechazo = 'No coincide' WHERE reciclador_id = $1",
      [reciclador],
    );
    expect(await codigoDeError(registrar())).toBeUndefined();
  });

  it('solo una plantilla activa puede ser la Meta del mes', async () => {
    const otra = propietario.query(
      `INSERT INTO plantilla_desafio (codigo, nombre, descripcion, tipo, meta, unidad, puntos, es_meta_mes)
       VALUES ('otra_meta', 'Otra meta', 'Prueba', 'KG_TOTAL', 200, 'kg', 10, true)`,
    );
    expect(await codigoDeError(otra)).toBe(UNICO);
  });
});
