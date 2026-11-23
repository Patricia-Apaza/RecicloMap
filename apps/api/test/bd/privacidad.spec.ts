import {
  admin,
  administrador,
  api,
  cerrarConexiones,
  codigoDeError,
  crearReciclador,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
} from './apoyo.js';

const ELIMINACION = 'RM040';
const INMUTABLE = 'RM030';

describe('Privacidad en la base de datos (Fase 13A)', () => {
  afterAll(cerrarConexiones);

  it('los hechos de privacidad solo se agregan: ni la API, ni la administración, ni el dueño los cambian', async () => {
    const id = await crearReciclador();
    await api.query("INSERT INTO registro_privacidad (usuario_id, tipo) VALUES ($1, 'EXPORTACION')", [id]);
    for (const conexion of [api, admin]) {
      expect(await codigoDeError(conexion.query("UPDATE registro_privacidad SET tipo = 'CUENTA_ANONIMIZADA'"))).toBe(
        PERMISO_DENEGADO,
      );
      expect(await codigoDeError(conexion.query('DELETE FROM registro_privacidad'))).toBe(PERMISO_DENEGADO);
    }
    expect(await codigoDeError(propietario.query("UPDATE registro_privacidad SET tipo = 'CUENTA_ANONIMIZADA'"))).toBe(
      INMUTABLE,
    );
    expect(await codigoDeError(propietario.query('DELETE FROM registro_privacidad'))).toBe(INMUTABLE);
    expect(
      await codigoDeError(
        admin.query("INSERT INTO registro_privacidad (usuario_id, tipo) VALUES ($1, 'EXPORTACION')", [id]),
      ),
    ).toBe(PERMISO_DENEGADO);
    expect(
      await codigoDeError(api.query("INSERT INTO registro_privacidad (usuario_id, tipo) VALUES ($1, 'COSA')", [id])),
    ).toBe(RESTRICCION);
    expect((await admin.query('SELECT count(*)::int AS n FROM registro_privacidad')).rows[0].n).toBeGreaterThan(0);
  });

  it('la exportación diaria es una por persona y por día, y la administración no la ve', async () => {
    const id = await crearReciclador();
    await api.query("INSERT INTO exportacion_datos (usuario_id, dia) VALUES ($1, '2026-11-17')", [id]);
    expect(
      await codigoDeError(api.query("INSERT INTO exportacion_datos (usuario_id, dia) VALUES ($1, '2026-11-17')", [id])),
    ).toBe('23505');
    expect(await codigoDeError(admin.query('SELECT * FROM exportacion_datos'))).toBe(PERMISO_DENEGADO);
  });

  it('la anonimización y los bloqueos solo los ejecuta la API, nunca la administración', async () => {
    const id = await crearReciclador();
    expect(await codigoDeError(admin.query('SELECT * FROM cuenta_bloqueos($1)', [id]))).toBe(PERMISO_DENEGADO);
    expect(await codigoDeError(admin.query('SELECT anonimizar_cuenta($1::uuid)', [id]))).toBe(PERMISO_DENEGADO);
    expect(await codigoDeError(admin.query('SELECT * FROM ubicaciones_propias()'))).toBe(PERMISO_DENEGADO);
    expect((await api.query('SELECT * FROM cuenta_bloqueos($1)', [id])).rows.every((f) => f.cantidad === 0)).toBe(true);
  });

  it('no se anonimiza una cuenta activa, una de administración ni una que no terminó su gracia', async () => {
    const id = await crearReciclador();
    expect(await codigoDeError(api.query('SELECT anonimizar_cuenta($1::uuid)', [id]))).toBe(ELIMINACION);
    await propietario.query(
      "UPDATE usuario SET estado = 'EN_ELIMINACION', eliminacion_solicitada_en = now(), eliminacion_programada_en = now() + interval '7 days' WHERE id = $1",
      [id],
    );
    expect(await codigoDeError(api.query('SELECT anonimizar_cuenta($1::uuid)', [id]))).toBe(ELIMINACION);
    expect(
      await codigoDeError(api.query("SELECT anonimizar_cuenta($1::uuid, now() + interval '8 days')", [id])),
    ).toBeUndefined();
    expect((await propietario.query('SELECT estado FROM usuario WHERE id = $1', [id])).rows[0].estado).toBe(
      'ELIMINADO',
    );
    expect(await codigoDeError(api.query('SELECT anonimizar_cuenta($1::uuid)', [await administrador()]))).toBe(
      ELIMINACION,
    );
    expect(
      await codigoDeError(api.query('SELECT anonimizar_cuenta($1::uuid)', ['00000000-0000-4000-8000-000000000000'])),
    ).toBe(ELIMINACION);
  });

  it('un estado de eliminación exige su fecha, y el teléfono interno solo existe en cuentas eliminadas', async () => {
    const id = await crearReciclador();
    expect(
      await codigoDeError(propietario.query("UPDATE usuario SET estado = 'EN_ELIMINACION' WHERE id = $1", [id])),
    ).toBe(RESTRICCION);
    expect(
      await codigoDeError(propietario.query("UPDATE usuario SET telefono = 'Xabcdef01' WHERE id = $1", [id])),
    ).toBe(RESTRICCION);
    expect(await codigoDeError(propietario.query("UPDATE usuario SET telefono = '12345' WHERE id = $1", [id]))).toBe(
      RESTRICCION,
    );
  });

  it('un negocio anonimizado pierde dirección, ubicación, teléfonos, fotos y avisos, y su nombre pasa a «Negocio eliminado»', async () => {
    const candidatos = (
      await propietario.query(
        "SELECT c.usuario_id AS id, c.id AS comprador FROM comprador c JOIN usuario u ON u.id = c.usuario_id WHERE u.estado = 'ACTIVO'",
      )
    ).rows as Array<{ id: string; comprador: string }>;
    const cliente = await propietario.connect();
    try {
      await cliente.query('BEGIN');
      let elegido: { id: string; comprador: string } | undefined;
      for (const c of candidatos) {
        const bloqueos = (await cliente.query('SELECT sum(cantidad)::int AS n FROM cuenta_bloqueos($1)', [c.id]))
          .rows[0].n as number;
        if (bloqueos === 0) {
          elegido = c;
          break;
        }
      }
      expect(elegido).toBeDefined();
      await cliente.query(
        "UPDATE usuario SET estado = 'EN_ELIMINACION', eliminacion_solicitada_en = now() - interval '8 days', eliminacion_programada_en = now() - interval '1 day' WHERE id = $1",
        [elegido!.id],
      );
      await cliente.query('SELECT anonimizar_cuenta($1::uuid)', [elegido!.id]);
      const fila = (
        await cliente.query(
          'SELECT nombre_comercial, descripcion, direccion, telefono_negocio, whatsapp, ubicacion IS NULL AS sin_ubicacion, posicion_aproximada IS NULL AS sin_posicion, eliminado_en IS NOT NULL AS eliminado FROM comprador WHERE id = $1',
          [elegido!.comprador],
        )
      ).rows[0];
      expect(fila).toMatchObject({
        nombre_comercial: 'Negocio eliminado',
        descripcion: null,
        direccion: null,
        telefono_negocio: null,
        whatsapp: '000000000',
        sin_ubicacion: true,
        sin_posicion: true,
        eliminado: true,
      });
      for (const tabla of [
        'comprador_horario',
        'comprador_pago',
        'comprador_foto',
        'parada_ruta',
        'aviso',
        'favorito',
        'evento_visita',
        'solicitud_llegada',
      ]) {
        expect(
          (await cliente.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE comprador_id = $1`, [elegido!.comprador]))
            .rows[0].n,
        ).toBe(0);
      }
      expect(
        (
          await cliente.query('SELECT nombre, telefono, correo, hash_contrasena FROM usuario WHERE id = $1', [
            elegido!.id,
          ])
        ).rows[0],
      ).toMatchObject({ nombre: 'Usuario eliminado', correo: null, hash_contrasena: null });
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });
});
