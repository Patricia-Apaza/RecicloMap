import {
  admin,
  administrador,
  api,
  cerrarConexiones,
  codigoDeError,
  crearPublicacion,
  crearReciclador,
  negocio,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
} from './apoyo.js';

const ESTADO_NO_PERMITIDO = 'RM034';
const MODERACION = 'RM035';

// La administración suspende o reactiva con su constancia en la misma operación, como lo hace la API
async function cambiarEstado(
  usuarioId: string,
  adminId: string,
  desde: 'ACTIVO' | 'SUSPENDIDO',
  hacia: 'ACTIVO' | 'SUSPENDIDO',
  conConstancia = true,
  motivo = 'Información falsa: prueba',
) {
  const cliente = await admin.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(
      `UPDATE usuario SET estado = $2::usuario_estado, motivo_suspension = $3, suspendido_en = $4, suspendido_por_id = $5 WHERE id = $1`,
      [
        usuarioId,
        hacia,
        hacia === 'SUSPENDIDO' ? 'Información falsa' : null,
        hacia === 'SUSPENDIDO' ? new Date() : null,
        hacia === 'SUSPENDIDO' ? adminId : null,
      ],
    );
    if (conConstancia) {
      await cliente.query(
        "INSERT INTO auditoria (admin_id, tipo, accion, entidad, entidad_id, motivo) VALUES ($1, 'USUARIOS', $2, 'usuario', $3, $4)",
        [adminId, desde === 'ACTIVO' ? 'SUSPENDER' : 'REACTIVAR', usuarioId, motivo],
      );
    }
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

const estadoDe = async (id: string) =>
  (await propietario.query('SELECT estado FROM usuario WHERE id = $1', [id])).rows[0].estado as string;

describe('Administración de usuarios y avisos en la base de datos (Fase 12A)', () => {
  afterAll(cerrarConexiones);

  describe('la administración no edita datos de una cuenta', () => {
    it.each([
      "UPDATE usuario SET nombre = 'Otro nombre' WHERE id = $1",
      "UPDATE usuario SET telefono = '900000000' WHERE id = $1",
      "UPDATE usuario SET correo = 'otro@correo.pe' WHERE id = $1",
      'UPDATE usuario SET ciudad_id = ciudad_id + 1 WHERE id = $1',
      "UPDATE usuario SET hash_contrasena = 'x' WHERE id = $1",
      "UPDATE usuario SET rol = 'ADMIN' WHERE id = $1",
      'UPDATE usuario SET eliminado_en = now() WHERE id = $1',
    ])('%s', async (sql) => {
      const id = await crearReciclador();
      expect(await codigoDeError(admin.query(sql, [id]))).toBe(PERMISO_DENEGADO);
    });

    it('tampoco borra una cuenta', async () => {
      const id = await crearReciclador();
      expect(await codigoDeError(admin.query('DELETE FROM usuario WHERE id = $1', [id]))).toBe(PERMISO_DENEGADO);
    });
  });

  describe('suspender y reactivar', () => {
    it('solo la administración, de ACTIVO a SUSPENDIDO y de vuelta, con su motivo en la auditoría de la misma operación', async () => {
      const id = await crearReciclador();
      const adminId = await administrador();
      await expect(cambiarEstado(id, adminId, 'ACTIVO', 'SUSPENDIDO', false)).rejects.toMatchObject({
        code: ESTADO_NO_PERMITIDO,
      });
      expect(await estadoDe(id)).toBe('ACTIVO');
      await expect(cambiarEstado(id, adminId, 'ACTIVO', 'SUSPENDIDO', true, 'no')).rejects.toMatchObject({
        code: ESTADO_NO_PERMITIDO,
      });
      await cambiarEstado(id, adminId, 'ACTIVO', 'SUSPENDIDO');
      expect(await estadoDe(id)).toBe('SUSPENDIDO');
      // Reactivar exige su propia constancia
      await expect(cambiarEstado(id, adminId, 'SUSPENDIDO', 'ACTIVO', false)).rejects.toMatchObject({
        code: ESTADO_NO_PERMITIDO,
      });
      await cambiarEstado(id, adminId, 'SUSPENDIDO', 'ACTIVO', true, 'Aclaró lo ocurrido');
      expect(await estadoDe(id)).toBe('ACTIVO');
    });

    it('una suspensión sin motivo en la cuenta no existe', async () => {
      const id = await crearReciclador();
      expect(
        await codigoDeError(propietario.query("UPDATE usuario SET estado = 'SUSPENDIDO' WHERE id = $1", [id])),
      ).toBe(RESTRICCION);
    });

    it('la API no suspende ni reactiva, pero sigue activando cuentas nuevas', async () => {
      const id = await crearReciclador();
      expect(
        await codigoDeError(
          api.query("UPDATE usuario SET estado = 'SUSPENDIDO', motivo_suspension = 'por mi cuenta' WHERE id = $1", [
            id,
          ]),
        ),
      ).toBe(ESTADO_NO_PERMITIDO);
      const adminId = await administrador();
      await cambiarEstado(id, adminId, 'ACTIVO', 'SUSPENDIDO');
      expect(
        await codigoDeError(
          api.query("UPDATE usuario SET estado = 'ACTIVO', motivo_suspension = NULL WHERE id = $1", [id]),
        ),
      ).toBe(ESTADO_NO_PERMITIDO);
      const nuevo = await crearReciclador();
      await propietario.query("UPDATE usuario SET estado = 'PENDIENTE_TELEFONO' WHERE id = $1", [nuevo]);
      expect(
        await codigoDeError(api.query("UPDATE usuario SET estado = 'ACTIVO' WHERE id = $1", [nuevo])),
      ).toBeUndefined();
    });

    it('una cuenta de administración no se suspende, ni otra situación se escribe desde la administración', async () => {
      const adminId = await administrador();
      const otro = await propietario.query(
        `INSERT INTO usuario (rol, nombre, telefono, telefono_verificado_en, ciudad_id, estado, actualizado_en)
         SELECT 'ADMIN', 'Otro admin de prueba', '96' || lpad((floor(random() * 10000000))::text, 7, '0'), now(), ciudad_id, 'ACTIVO', now() FROM usuario WHERE id = $1 RETURNING id`,
        [adminId],
      );
      await expect(cambiarEstado(otro.rows[0].id, adminId, 'ACTIVO', 'SUSPENDIDO')).rejects.toMatchObject({
        code: ESTADO_NO_PERMITIDO,
      });
      const id = await crearReciclador();
      expect(await codigoDeError(admin.query("UPDATE usuario SET estado = 'ELIMINADO' WHERE id = $1", [id]))).toBe(
        ESTADO_NO_PERMITIDO,
      );
    });

    it('las publicaciones de una cuenta suspendida no se ofrecen a los negocios y vuelven al reactivar', async () => {
      const reciclador = await crearReciclador();
      const titicaca = await negocio('Acopio Titicaca');
      const publicacionId = await crearPublicacion(reciclador);
      const visibles = async () =>
        (await propietario.query('SELECT publicacion_id FROM publicaciones_cercanas($1)', [titicaca.id])).rows.map(
          (f) => f.publicacion_id as string,
        );
      expect(await visibles()).toContain(publicacionId);
      const adminId = await administrador();
      await cambiarEstado(reciclador, adminId, 'ACTIVO', 'SUSPENDIDO');
      expect(await visibles()).not.toContain(publicacionId);
      await cambiarEstado(reciclador, adminId, 'SUSPENDIDO', 'ACTIVO', true, 'Aclaró lo ocurrido');
      expect(await visibles()).toContain(publicacionId);
    });
  });

  describe('auditoría', () => {
    it('cada decisión deja su constancia con administrador, motivo y transacción, y nadie la edita', async () => {
      const id = await crearReciclador();
      const adminId = await administrador();
      await cambiarEstado(id, adminId, 'ACTIVO', 'SUSPENDIDO');
      const fila = (
        await propietario.query(
          "SELECT admin_id, motivo, tx_id FROM auditoria WHERE entidad_id = $1 AND accion = 'SUSPENDER'",
          [id],
        )
      ).rows[0];
      expect(fila.admin_id).toBe(adminId);
      expect(fila.motivo.length).toBeGreaterThanOrEqual(5);
      expect(Number(fila.tx_id)).toBeGreaterThan(0);
      for (const conexion of [admin, api]) {
        expect(await codigoDeError(conexion.query("UPDATE auditoria SET motivo = 'otro motivo'"))).toBe(
          PERMISO_DENEGADO,
        );
        expect(await codigoDeError(conexion.query('DELETE FROM auditoria'))).toBe(PERMISO_DENEGADO);
      }
      expect(await codigoDeError(propietario.query("UPDATE auditoria SET motivo = 'otro motivo'"))).toBe('RM030');
      expect(await codigoDeError(propietario.query('DELETE FROM auditoria'))).toBe('RM030');
    });
  });

  describe('moderación de avisos', () => {
    async function aviso() {
      const n = await negocio('Acopio Titicaca');
      const r = await propietario.query(
        "INSERT INTO aviso (comprador_id, tipo, titulo, mensaje, vigente_hasta) VALUES ($1, 'ANUNCIO', 'Aviso de prueba', 'Mensaje', current_date + 5) RETURNING id",
        [n.id],
      );
      return r.rows[0].id as string;
    }
    async function moderar(avisoId: string, adminId: string, hacia: 'OCULTO' | 'ACTIVO', conConstancia = true) {
      const cliente = await admin.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query(
          'UPDATE aviso SET estado = $2::aviso_estado, motivo_oculto = $3, oculto_por_id = $4, oculto_en = $5 WHERE id = $1',
          [
            avisoId,
            hacia,
            hacia === 'OCULTO' ? 'Incluye un precio' : null,
            hacia === 'OCULTO' ? adminId : null,
            hacia === 'OCULTO' ? new Date() : null,
          ],
        );
        if (conConstancia) {
          await cliente.query(
            "INSERT INTO auditoria (admin_id, tipo, accion, entidad, entidad_id, motivo) VALUES ($1, 'AVISOS', $2, 'aviso', $3, 'Motivo de la moderación')",
            [adminId, hacia === 'OCULTO' ? 'OCULTAR' : 'RESTITUIR', avisoId],
          );
        }
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    }

    it('la administración oculta y restituye con motivo y constancia, y no edita el aviso', async () => {
      const id = await aviso();
      const adminId = await administrador();
      await expect(moderar(id, adminId, 'OCULTO', false)).rejects.toMatchObject({ code: MODERACION });
      await moderar(id, adminId, 'OCULTO');
      expect(
        (await propietario.query('SELECT estado, motivo_oculto FROM aviso WHERE id = $1', [id])).rows[0],
      ).toMatchObject({
        estado: 'OCULTO',
        motivo_oculto: 'Incluye un precio',
      });
      await expect(moderar(id, adminId, 'ACTIVO', false)).rejects.toMatchObject({ code: MODERACION });
      await moderar(id, adminId, 'ACTIVO');
      for (const sql of [
        "UPDATE aviso SET titulo = 'Otro título' WHERE id = $1",
        "UPDATE aviso SET mensaje = 'Otro' WHERE id = $1",
        'DELETE FROM aviso WHERE id = $1',
      ]) {
        expect(await codigoDeError(admin.query(sql, [id]))).toBe(PERMISO_DENEGADO);
      }
    });

    it('el negocio no oculta ni restituye por su cuenta, y un aviso oculto lleva motivo', async () => {
      const id = await aviso();
      expect(
        await codigoDeError(
          api.query(
            "UPDATE aviso SET estado = 'OCULTO', motivo_oculto = 'yo mismo', oculto_por_id = (SELECT id FROM usuario WHERE rol = 'ADMIN' LIMIT 1) WHERE id = $1",
            [id],
          ),
        ),
      ).toBe(MODERACION);
      expect(await codigoDeError(propietario.query("UPDATE aviso SET estado = 'OCULTO' WHERE id = $1", [id]))).toBe(
        RESTRICCION,
      );
    });
  });
});
