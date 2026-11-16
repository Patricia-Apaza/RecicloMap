import {
  admin,
  administrador,
  api,
  avanzarOperacion,
  cerrarConexiones,
  codigoDeError,
  coordenadas,
  crearOperacion,
  crearPublicacion,
  crearReciclador,
  material,
  negocio,
  PERMISO_DENEGADO,
  propietario,
} from './apoyo.js';

describe('Permisos de los usuarios de base de datos', () => {
  afterAll(cerrarConexiones);

  describe('el usuario de administración no puede escribir precios', () => {
    it('lee precios', async () => {
      const resultado = await admin.query('SELECT count(*)::int AS total FROM precio_material');
      expect(resultado.rows[0].total).toBeGreaterThan(0);
    });

    it('no puede actualizar un precio', async () => {
      expect(await codigoDeError(admin.query('UPDATE precio_material SET precio_max = precio_max + 1'))).toBe(
        PERMISO_DENEGADO,
      );
    });

    it('no puede insertar ni borrar precios', async () => {
      const { id, usuarioId } = await negocio('Compras Rubén');
      const alta = admin.query(
        'INSERT INTO precio_material (comprador_id, material_id, precio_min, precio_max, actualizado_por_id) VALUES ($1, $2, 1, 2, $3)',
        [id, await material('papel'), usuarioId],
      );
      expect(await codigoDeError(alta)).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query('DELETE FROM precio_material'))).toBe(PERMISO_DENEGADO);
    });

    it('no puede escribir en el historial de precios', async () => {
      expect(await codigoDeError(admin.query('DELETE FROM historial_precio'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(api.query('UPDATE historial_precio SET precio_min = 1'))).toBe(PERMISO_DENEGADO);
    });

    it('suspender la visibilidad no altera el precio', async () => {
      const { id } = await negocio('Reciclajes San Román');
      const antes = await propietario.query(
        'SELECT id, precio_min, precio_max FROM precio_material WHERE comprador_id = $1 AND material_id = $2',
        [id, await material('metal')],
      );
      const precio = antes.rows[0];
      await admin.query(
        "INSERT INTO moderacion_precio (precio_material_id, estado, motivo, admin_id) VALUES ($1, 'SUSPENDIDO', 'Prueba de suspensión', $2)",
        [precio.id, await administrador()],
      );
      const despues = await propietario.query('SELECT precio_min, precio_max FROM precio_material WHERE id = $1', [
        precio.id,
      ]);
      expect(despues.rows[0]).toEqual({ precio_min: precio.precio_min, precio_max: precio.precio_max });
      const enMapa = await api.query('SELECT 1 FROM v_mapa WHERE precio_material_id = $1', [precio.id]);
      expect(enMapa.rowCount).toBe(0);
    });
  });

  describe('el usuario de administración no escribe el peso de una operación', () => {
    it('no puede cambiar los kilos ni el monto', async () => {
      const { operacionId } = await crearOperacion('EcoAcopio Juliaca');
      await avanzarOperacion(operacionId, 'CONFIRMADA');
      const intento = admin.query('UPDATE operacion SET kg_final = 99 WHERE id = $1', [operacionId]);
      expect(await codigoDeError(intento)).toBe(PERMISO_DENEGADO);
    });

    it('sí puede cerrar una disputa con los kilos vigentes', async () => {
      const { operacionId } = await crearOperacion('EcoAcopio Juliaca');
      await avanzarOperacion(operacionId, 'CONFIRMADA');
      await propietario.query('UPDATE operacion SET en_disputa = true WHERE id = $1', [operacionId]);
      await admin.query(
        "UPDATE operacion SET estado = 'COMPLETADA', en_disputa = false, completada_en = now() WHERE id = $1",
        [operacionId],
      );
      const fila = await propietario.query('SELECT estado, kg_final FROM operacion WHERE id = $1', [operacionId]);
      expect(fila.rows[0]).toEqual({ estado: 'COMPLETADA', kg_final: '34.00' });
    });
  });

  describe('el usuario de la API no puede leer la ubicación del reciclador', () => {
    it('no puede consultar la tabla de ubicaciones', async () => {
      expect(await codigoDeError(api.query('SELECT * FROM publicacion_ubicacion'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(api.query('SELECT ST_AsText(ubicacion::geometry) FROM publicacion_ubicacion'))).toBe(
        PERMISO_DENEGADO,
      );
    });

    it('no puede modificarla ni borrarla', async () => {
      expect(await codigoDeError(api.query('UPDATE publicacion_ubicacion SET origen = origen'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(api.query('DELETE FROM publicacion_ubicacion'))).toBe(PERMISO_DENEGADO);
    });

    it('sí puede guardarla al publicar', async () => {
      const reciclador = await crearReciclador();
      const publicacion = await propietario.query(
        `INSERT INTO publicacion (reciclador_id, material_id, cantidad_kg, ciudad_id, vence_en, actualizada_en)
         SELECT $1, $2, 20, ciudad_id, now() + interval '7 days', now() FROM usuario WHERE id = $1 RETURNING id`,
        [reciclador, await material('carton')],
      );
      const { lat, lng } = coordenadas(0.2, 0.2);
      const alta = api.query(
        'INSERT INTO publicacion_ubicacion (publicacion_id, ubicacion) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)',
        [publicacion.rows[0].id, lng, lat],
      );
      expect(await codigoDeError(alta)).toBeUndefined();
    });

    it('el usuario de administración tampoco puede leerla ni pedir tramos', async () => {
      const publicacion = await crearPublicacion(await crearReciclador());
      const { id } = await negocio('Acopio Titicaca');
      expect(await codigoDeError(admin.query('SELECT * FROM publicacion_ubicacion'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query('SELECT publicacion_tramo($1, $2)', [publicacion, id]))).toBe(
        PERMISO_DENEGADO,
      );
    });
  });

  describe('auditoría y sorteos solo admiten insertar y leer', () => {
    it('la auditoría se inserta y se lee, pero no se cambia ni se borra', async () => {
      const adminId = await administrador();
      await admin.query(
        "INSERT INTO auditoria (admin_id, tipo, accion, entidad, entidad_id, motivo) VALUES ($1, 'USUARIOS', 'SUSPENDER', 'usuario', 'prueba', 'Prueba')",
        [adminId],
      );
      const lectura = await admin.query('SELECT count(*)::int AS total FROM auditoria');
      expect(lectura.rows[0].total).toBeGreaterThan(0);
      for (const conexion of [admin, api]) {
        expect(await codigoDeError(conexion.query("UPDATE auditoria SET motivo = 'otro'"))).toBe(PERMISO_DENEGADO);
        expect(await codigoDeError(conexion.query('DELETE FROM auditoria'))).toBe(PERMISO_DENEGADO);
      }
    });

    it('ni siquiera el dueño de la base puede alterar la auditoría', async () => {
      expect(await codigoDeError(propietario.query("UPDATE auditoria SET motivo = 'otro'"))).toBe('RM030');
      expect(await codigoDeError(propietario.query('DELETE FROM auditoria'))).toBe('RM030');
      expect(await codigoDeError(propietario.query('TRUNCATE auditoria'))).toBe('RM030');
    });

    it('el registro de sorteos se inserta y se lee, pero no se cambia ni se borra', async () => {
      const reciclador = await crearReciclador();
      const giro = await propietario.query(
        "INSERT INTO giro (usuario_id, origen, numero) VALUES ($1, 'PUNTOS', 1) RETURNING id",
        [reciclador],
      );
      const premio = await propietario.query("SELECT id FROM premio WHERE tipo = 'SIN_PREMIO' LIMIT 1");
      const configuracion = await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion');
      await api.query(
        'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 8123, $4)',
        [giro.rows[0].id, reciclador, configuracion.rows[0].id, premio.rows[0].id],
      );
      const lectura = await api.query('SELECT count(*)::int AS total FROM sorteo_ruleta');
      expect(lectura.rows[0].total).toBeGreaterThan(0);
      for (const conexion of [admin, api]) {
        expect(await codigoDeError(conexion.query('UPDATE sorteo_ruleta SET numero_sorteado = 1'))).toBe(
          PERMISO_DENEGADO,
        );
        expect(await codigoDeError(conexion.query('DELETE FROM sorteo_ruleta'))).toBe(PERMISO_DENEGADO);
      }
      expect(await codigoDeError(propietario.query('UPDATE sorteo_ruleta SET numero_sorteado = 1'))).toBe('RM030');
      expect(await codigoDeError(propietario.query('DELETE FROM sorteo_ruleta'))).toBe('RM030');
    });

    it('las configuraciones publicadas de la ruleta no se modifican', async () => {
      expect(await codigoDeError(admin.query("UPDATE ruleta_configuracion SET premios = '[]'"))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(propietario.query('DELETE FROM ruleta_configuracion'))).toBe('RM030');
    });
  });
});
