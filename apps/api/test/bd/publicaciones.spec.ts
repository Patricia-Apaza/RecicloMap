import { api, cerrarConexiones, crearPublicacion, crearReciclador, negocio, propietario } from './apoyo.js';

describe('Visibilidad de publicaciones (RF-23) y funciones de ubicación', () => {
  afterAll(cerrarConexiones);

  it('una publicación lejana de la misma ciudad la ve igual un negocio verificado', async () => {
    // 30 km al este: fuera de cualquier radio de búsqueda, pero en Juliaca
    const lejana = await crearPublicacion(await crearReciclador(), { este: 30, codigoMaterial: 'metal' });
    const { id } = await negocio('Compras Rubén');
    const resultado = await api.query('SELECT publicacion_id, tramo::text FROM publicaciones_cercanas($1)', [id]);
    const fila = resultado.rows.find((r) => r.publicacion_id === lejana);
    expect(fila?.tramo).toBe('más de 5 km');
  });

  it('el aviso de publicación nueva llega solo a los negocios dentro de la distancia', async () => {
    const publicacion = await crearPublicacion(await crearReciclador());
    const resultado = await api.query('SELECT * FROM negocios_para_aviso($1, $2)', [publicacion, 5000]);
    const lejano = await negocio('Recicla Puno Sur');
    const cercano = await negocio('Acopio Titicaca');
    const ids = resultado.rows.map((r) => r.comprador_id);
    expect(ids).toContain(cercano.id);
    expect(ids).not.toContain(lejano.id);
    expect(resultado.fields.map((campo) => campo.name)).toEqual(['comprador_id', 'usuario_id', 'tramo']);
  });

  it('la distancia del dueño a cada negocio llega en km con un decimal, sin coordenadas', async () => {
    const publicacion = await crearPublicacion(await crearReciclador());
    const { id } = await negocio('Acopio Titicaca');
    const resultado = await api.query('SELECT publicacion_distancia_km($1, $2) AS km', [publicacion, id]);
    expect(Number(resultado.rows[0].km)).toBeGreaterThan(0);
    expect(String(resultado.rows[0].km)).toMatch(/^\d+(\.\d)?$/);
  });

  it('ya no existe una función para copiar la ubicación de otra publicación', async () => {
    const { rowCount } = await propietario.query(
      "SELECT 1 FROM pg_proc WHERE proname = 'publicacion_copiar_ubicacion'",
    );
    expect(rowCount).toBe(0);
  });

  it('una publicación lejana queda fuera si la ciudad tiene un radio máximo de visibilidad', async () => {
    const lejana = await crearPublicacion(await crearReciclador(), { este: 30 });
    const { id } = await negocio('Compras Rubén');
    await propietario.query(
      "INSERT INTO parametro (clave, valor, descripcion) VALUES ('radio_visibilidad_km', '10', 'Prueba') ON CONFLICT (clave) DO UPDATE SET valor = '10'",
    );
    const conRadio = await api.query('SELECT publicacion_id FROM publicaciones_cercanas($1)', [id]);
    await propietario.query("UPDATE parametro SET valor = '0' WHERE clave = 'radio_visibilidad_km'");
    const sinRadio = await api.query('SELECT publicacion_id FROM publicaciones_cercanas($1)', [id]);
    expect(conRadio.rows.map((r) => r.publicacion_id)).not.toContain(lejana);
    expect(sinRadio.rows.map((r) => r.publicacion_id)).toContain(lejana);
  });

  it('la API sigue sin poder leer la ubicación de una publicación', async () => {
    await expect(api.query('SELECT ubicacion FROM publicacion_ubicacion LIMIT 1')).rejects.toThrow(/permission denied/);
  });
});
