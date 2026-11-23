import {
  admin,
  administrador,
  api,
  cerrarConexiones,
  codigoDeError,
  negocio,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
  UNICO,
} from './apoyo.js';

const BLOQUEO = 'RM030';
const SOLO_ADMIN = 'RM032';
const CAMBIO_DE_PLAN = 'RM033';

// Un negocio Gratis, propio de cada prueba
async function negocioGratis(): Promise<string> {
  const base = await negocio('Acopio Titicaca');
  const copia = await propietario.query(
    `INSERT INTO usuario (rol, nombre, telefono, telefono_verificado_en, ciudad_id, estado, actualizado_en)
     SELECT 'CENTRO', 'Negocio de prueba', '97' || lpad((floor(random() * 10000000))::text, 7, '0'), now(), ciudad_id, 'ACTIVO', now()
       FROM usuario WHERE id = $1 RETURNING id`,
    [base.usuarioId],
  );
  const comprador = await propietario.query(
    `INSERT INTO comprador (usuario_id, tipo, nombre_comercial, direccion, zona_id, ubicacion, ubicacion_confirmada, whatsapp, estado_verificacion)
     SELECT $1, 'CENTRO', 'Negocio de prueba', direccion, zona_id, ubicacion, true, whatsapp, 'EN_REVISION' FROM comprador WHERE id = $2 RETURNING id`,
    [copia.rows[0].id, base.id],
  );
  // Como cualquier negocio de la semilla, tiene al menos un precio
  await propietario.query(
    `INSERT INTO precio_material (comprador_id, material_id, precio_min, precio_max, demanda, actualizado_por_id)
     SELECT $1, material_id, precio_min, precio_max, demanda, $3 FROM precio_material WHERE comprador_id = $2 LIMIT 1`,
    [comprador.rows[0].id, base.id, copia.rows[0].id],
  );
  return comprador.rows[0].id as string;
}

const planDe = async (id: string) =>
  (
    await propietario.query(
      'SELECT plan, plan_desde::text AS desde, plan_hasta::text AS hasta FROM comprador WHERE id = $1',
      [id],
    )
  ).rows[0] as { plan: string; desde: string | null; hasta: string | null };

// Como lo hace la administración: el cambio y su constancia con motivo en la misma operación
async function activarComoAdmin(compradorId: string, adminId: string, conConstancia = true) {
  const cliente = await admin.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(
      "UPDATE comprador SET plan = 'PRO', plan_desde = current_date, plan_hasta = current_date + 30 WHERE id = $1",
      [compradorId],
    );
    if (conConstancia) {
      await cliente.query(
        "INSERT INTO plan_historial (comprador_id, accion, desde, hasta, motivo, admin_id) VALUES ($1, 'ACTIVADO', current_date, current_date + 30, 'Activación de prueba', $2)",
        [compradorId, adminId],
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

describe('Plan Pro en la base de datos (Fase 11)', () => {
  afterAll(cerrarConexiones);

  describe('solo la administración cambia el plan, con motivo y constancia', () => {
    it('la API (el negocio) no puede volverse Pro ni cambiar sus fechas', async () => {
      const id = await negocioGratis();
      expect(
        await codigoDeError(
          api.query(
            "UPDATE comprador SET plan = 'PRO', plan_desde = current_date, plan_hasta = current_date + 30 WHERE id = $1",
            [id],
          ),
        ),
      ).toBe(CAMBIO_DE_PLAN);
      expect((await planDe(id)).plan).toBe('GRATIS');
    });

    it('la administración cambia el plan solo con la constancia de su motivo en la misma operación', async () => {
      const id = await negocioGratis();
      const adminId = await administrador();
      await expect(activarComoAdmin(id, adminId, false)).rejects.toMatchObject({ code: CAMBIO_DE_PLAN });
      expect((await planDe(id)).plan).toBe('GRATIS');
      await activarComoAdmin(id, adminId);
      expect((await planDe(id)).plan).toBe('PRO');
    });

    it('la administración solo escribe el plan y sus fechas: ni el nombre, ni el WhatsApp, ni los precios del negocio', async () => {
      const id = await negocioGratis();
      for (const sql of [
        "UPDATE comprador SET nombre_comercial = 'Otro nombre' WHERE id = $1",
        "UPDATE comprador SET whatsapp = '900000000' WHERE id = $1",
        'UPDATE comprador SET calif_prom = 5 WHERE id = $1',
        'UPDATE precio_material SET precio_max = 49 WHERE comprador_id = $1',
      ]) {
        expect(await codigoDeError(admin.query(sql, [id]))).toBe(PERMISO_DENEGADO);
      }
    });

    it('la administración no puede dejar un Pro sin fechas ni con el fin antes del inicio', async () => {
      const id = await negocioGratis();
      expect(await codigoDeError(admin.query("UPDATE comprador SET plan = 'PRO' WHERE id = $1", [id]))).toBe(
        RESTRICCION,
      );
      expect(
        await codigoDeError(
          admin.query(
            "UPDATE comprador SET plan = 'PRO', plan_desde = current_date, plan_hasta = current_date - 1 WHERE id = $1",
            [id],
          ),
        ),
      ).toBe(RESTRICCION);
    });

    it('el vencimiento lo hace el sistema (API) solo de Pro a Gratis, con su constancia y sin tocar las fechas', async () => {
      const id = await negocioGratis();
      const adminId = await administrador();
      await activarComoAdmin(id, adminId);
      const cliente = await api.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query("UPDATE comprador SET plan = 'GRATIS' WHERE id = $1", [id]);
        await cliente.query(
          "INSERT INTO plan_historial (comprador_id, accion, motivo) VALUES ($1, 'VENCIDO', 'Terminó la fecha de fin')",
          [id],
        );
        await cliente.query('COMMIT');
      } finally {
        cliente.release();
      }
      const despues = await planDe(id);
      expect(despues.plan).toBe('GRATIS');
      expect(despues.hasta).not.toBeNull();
      // Sin la constancia del vencimiento, la API no puede ni siquiera bajar el plan
      await activarComoAdmin(id, adminId);
      expect(await codigoDeError(api.query("UPDATE comprador SET plan = 'GRATIS' WHERE id = $1", [id]))).toBe(
        CAMBIO_DE_PLAN,
      );
    });
  });

  describe('historial del plan', () => {
    it('solo se agrega y se lee: nadie lo edita ni lo borra', async () => {
      const id = await negocioGratis();
      await activarComoAdmin(id, await administrador());
      for (const conexion of [api, admin]) {
        expect(await codigoDeError(conexion.query("UPDATE plan_historial SET motivo = 'otro motivo'"))).toBe(
          PERMISO_DENEGADO,
        );
        expect(await codigoDeError(conexion.query('DELETE FROM plan_historial'))).toBe(PERMISO_DENEGADO);
      }
      expect(await codigoDeError(propietario.query("UPDATE plan_historial SET motivo = 'otro motivo'"))).toBe(BLOQUEO);
      expect(await codigoDeError(propietario.query('DELETE FROM plan_historial'))).toBe(BLOQUEO);
      expect(await codigoDeError(propietario.query('TRUNCATE plan_historial'))).toBe(BLOQUEO);
    });

    it('exige motivo, fechas al activar y una persona de administración en cada decisión', async () => {
      const id = await negocioGratis();
      const insertar = (
        accion: string,
        motivo: string,
        adminId: string | null,
        desde: string | null = null,
        hasta: string | null = null,
      ) =>
        propietario.query(
          'INSERT INTO plan_historial (comprador_id, accion, desde, hasta, motivo, admin_id) VALUES ($1, $2::plan_accion, $3, $4, $5, $6)',
          [id, accion, desde, hasta, motivo, adminId],
        );
      const adminId = await administrador();
      expect(await codigoDeError(insertar('DESACTIVADO', 'no', adminId))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar('ACTIVADO', 'Con motivo', adminId))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar('DESACTIVADO', 'Con motivo', null))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar('VENCIDO', 'Terminó el plan', null))).toBeUndefined();
    });
  });

  describe('solicitudes', () => {
    const solicitar = (id: string) =>
      api.query('INSERT INTO solicitud_plan (comprador_id, mensaje) VALUES ($1, $2)', [id, 'Quiero Pro']);

    it('un negocio tiene una sola solicitud pendiente a la vez', async () => {
      const id = await negocioGratis();
      await solicitar(id);
      expect(await codigoDeError(solicitar(id))).toBe(UNICO);
    });

    it('el negocio solo la cancela y la administración solo la aprueba o rechaza, una vez', async () => {
      const id = await negocioGratis();
      const adminId = await administrador();
      const nueva = async () => {
        await propietario.query(
          "UPDATE solicitud_plan SET estado = 'CANCELADA' WHERE comprador_id = $1 AND estado = 'PENDIENTE'",
          [id],
        );
        return (await propietario.query('INSERT INTO solicitud_plan (comprador_id) VALUES ($1) RETURNING id', [id]))
          .rows[0].id as string;
      };
      let solicitud = await nueva();
      expect(
        await codigoDeError(
          api.query(
            "UPDATE solicitud_plan SET estado = 'RECHAZADA', motivo_decision = 'No cumple', decidida_por_id = $2 WHERE id = $1",
            [solicitud, adminId],
          ),
        ),
      ).toBe(SOLO_ADMIN);
      expect(
        await codigoDeError(admin.query("UPDATE solicitud_plan SET estado = 'CANCELADA' WHERE id = $1", [solicitud])),
      ).toBe(SOLO_ADMIN);
      expect(
        await codigoDeError(admin.query("UPDATE solicitud_plan SET estado = 'RECHAZADA' WHERE id = $1", [solicitud])),
      ).toBe(RESTRICCION);
      expect(
        await codigoDeError(
          admin.query(
            "UPDATE solicitud_plan SET estado = 'RECHAZADA', motivo_decision = 'No cumple aún', decidida_por_id = $2 WHERE id = $1",
            [solicitud, adminId],
          ),
        ),
      ).toBeUndefined();
      expect(
        await codigoDeError(api.query("UPDATE solicitud_plan SET estado = 'CANCELADA' WHERE id = $1", [solicitud])),
      ).toBe(BLOQUEO);

      solicitud = await nueva();
      expect(
        await codigoDeError(api.query("UPDATE solicitud_plan SET estado = 'CANCELADA' WHERE id = $1", [solicitud])),
      ).toBeUndefined();
      expect(
        (await propietario.query('SELECT atendida_en FROM solicitud_plan WHERE id = $1', [solicitud])).rows[0]
          .atendida_en,
      ).not.toBeNull();
    });

    it('aprobar exige las fechas y quién decidió', async () => {
      const id = await negocioGratis();
      const adminId = await administrador();
      const s = (
        await propietario.query("INSERT INTO solicitud_plan (comprador_id, mensaje) VALUES ($1, 'Hola') RETURNING id", [
          id,
        ])
      ).rows[0].id as string;
      expect(await codigoDeError(admin.query("UPDATE solicitud_plan SET estado = 'APROBADA' WHERE id = $1", [s]))).toBe(
        RESTRICCION,
      );
      expect(
        await codigoDeError(
          admin.query(
            "UPDATE solicitud_plan SET estado = 'APROBADA', desde = current_date, hasta = current_date + 30, decidida_por_id = $2 WHERE id = $1",
            [s, adminId],
          ),
        ),
      ).toBeUndefined();
    });
  });
});
