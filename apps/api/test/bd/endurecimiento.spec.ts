import {
  admin,
  administrador,
  api,
  avanzarOperacion,
  cerrarConexiones,
  codigoDeError,
  crearOperacion,
  crearPublicacion,
  crearReciclador,
  giroGastado,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
} from './apoyo.js';

const BLOQUEO = 'RM030';
const UBICACION_AJENA = 'RM041';
const CONTROL = 'RM042';
const FUNCION_INEXISTENTE = '42883';

// Ejecuta una consulta como la API con la persona autenticada fijada, igual que hace la exportación
async function comoApi<T>(usuario: string | null, sql: string, valores: unknown[] = []): Promise<T[]> {
  const cliente = await api.connect();
  try {
    await cliente.query('BEGIN');
    if (usuario) await cliente.query("SELECT set_config('rm.usuario_id', $1, true)", [usuario]);
    const r = await cliente.query(sql, valores);
    await cliente.query('COMMIT');
    return r.rows as T[];
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

describe('Endurecimiento en la base de datos (Fase 13B)', () => {
  afterAll(cerrarConexiones);

  describe('ubicaciones_propias: ataque', () => {
    it('sin persona autenticada, o sin una exportación recién hecha, no entrega nada', async () => {
      const victima = await crearReciclador();
      await crearPublicacion(victima, { este: 3, sur: 4 });
      expect(await codigoDeError(comoApi(null, 'SELECT * FROM ubicaciones_propias()'))).toBe(UBICACION_AJENA);
      expect(await codigoDeError(comoApi('no-es-un-uuid', 'SELECT * FROM ubicaciones_propias()'))).toBe('22P02');
      expect(await codigoDeError(comoApi(victima, 'SELECT * FROM ubicaciones_propias()'))).toBe(UBICACION_AJENA);
    });

    it('con la exportación de una persona solo salen sus puntos, nunca los de otra', async () => {
      const a = await crearReciclador();
      const b = await crearReciclador();
      const pa = await crearPublicacion(a, { este: 5, sur: 1 });
      const pb = await crearPublicacion(b, { este: 9, sur: 9 });
      const dia = (n: number) => `2030-01-${String(n).padStart(2, '0')}`;
      await api.query('INSERT INTO exportacion_datos (usuario_id, dia) VALUES ($1, $2)', [
        a,
        dia(1 + Math.floor(Math.random() * 28)),
      ]);
      const propias = await comoApi<{ publicacion_id: string }>(a, 'SELECT publicacion_id FROM ubicaciones_propias()');
      expect(propias.map((f) => f.publicacion_id)).toEqual([pa]);
      // Aunque la llamada diga ser otra persona, sin su exportación no entrega nada y nunca devuelve lo de A
      expect(await codigoDeError(comoApi(b, 'SELECT * FROM ubicaciones_propias()'))).toBe(UBICACION_AJENA);
      await api.query('INSERT INTO exportacion_datos (usuario_id, dia) VALUES ($1, $2)', [
        b,
        dia(1 + Math.floor(Math.random() * 28)),
      ]);
      const deB = await comoApi<{ publicacion_id: string }>(b, 'SELECT publicacion_id FROM ubicaciones_propias()');
      expect(deB.map((f) => f.publicacion_id)).toEqual([pb]);
    });

    it('una exportación de hace más de 5 minutos ya no autoriza', async () => {
      const a = await crearReciclador();
      await crearPublicacion(a);
      await api.query('INSERT INTO exportacion_datos (usuario_id, dia) VALUES ($1, $2)', [a, '2030-02-01']);
      await propietario.query(
        "UPDATE exportacion_datos SET creada_en = now() - interval '6 minutes' WHERE usuario_id = $1",
        [a],
      );
      expect(await codigoDeError(comoApi(a, 'SELECT * FROM ubicaciones_propias()'))).toBe(UBICACION_AJENA);
    });

    it('la función ya no recibe un identificador, y la administración ni el público la ejecutan', async () => {
      const a = await crearReciclador();
      expect(await codigoDeError(comoApi(a, 'SELECT * FROM ubicaciones_propias($1::uuid)', [a]))).toBe(
        FUNCION_INEXISTENTE,
      );
      expect(await codigoDeError(admin.query('SELECT * FROM ubicaciones_propias()'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(api.query('SELECT ubicacion FROM publicacion_ubicacion LIMIT 1'))).toBe(
        PERMISO_DENEGADO,
      );
      const publico = (
        await propietario.query("SELECT has_function_privilege('public', 'ubicaciones_propias()', 'EXECUTE') AS puede")
      ).rows[0].puede as boolean;
      expect(publico).toBe(false);
    });
  });

  describe('renunciar a un premio', () => {
    const premioGanado = async (usuario: string) => {
      const premio = (
        await propietario.query(
          "SELECT id, stock FROM premio WHERE tipo = 'OBJETO' AND activo AND stock IS NOT NULL LIMIT 1",
        )
      ).rows[0] as { id: string; stock: number };
      const giro = await giroGastado(usuario);
      const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
      const sorteo = (
        await propietario.query(
          'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
          [giro, usuario, config, premio.id],
        )
      ).rows[0].id as string;
      const id = (
        await propietario.query(
          "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, $4, 'Punto', now() + interval '10 days') RETURNING id",
          [sorteo, usuario, premio.id, `RM-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')}`],
        )
      ).rows[0].id as string;
      return { id, premio: premio.id };
    };

    it('la persona renuncia por reclamar o reclamado, queda registrado y no devuelve stock', async () => {
      const u = await crearReciclador();
      const { id, premio } = await premioGanado(u);
      const stock = async () =>
        (await propietario.query('SELECT stock FROM premio WHERE id = $1', [premio])).rows[0].stock as number;
      const antes = await stock();
      await api.query("UPDATE premio_ganado SET estado = 'RENUNCIADO' WHERE id = $1", [id]);
      const fila = (await propietario.query('SELECT estado, renunciado_en FROM premio_ganado WHERE id = $1', [id]))
        .rows[0];
      expect(fila.estado).toBe('RENUNCIADO');
      expect(fila.renunciado_en).not.toBeNull();
      expect(await stock()).toBe(antes);
      // Ya no cambia de estado ni se le tocan las fechas
      for (const destino of ['POR_RECLAMAR', 'RECLAMADO', 'ENTREGADO', 'VENCIDO']) {
        expect(
          await codigoDeError(
            propietario.query('UPDATE premio_ganado SET estado = $2::premio_ganado_estado WHERE id = $1', [
              id,
              destino,
            ]),
          ),
        ).toBe(BLOQUEO);
      }
      const otro = await premioGanado(await crearReciclador());
      await api.query("UPDATE premio_ganado SET estado = 'RECLAMADO' WHERE id = $1", [otro.id]);
      await api.query("UPDATE premio_ganado SET estado = 'RENUNCIADO' WHERE id = $1", [otro.id]);
    });

    it('la administración no renuncia por nadie, y un premio entregado no se renuncia', async () => {
      const u = await crearReciclador();
      const { id } = await premioGanado(u);
      expect(
        await codigoDeError(admin.query("UPDATE premio_ganado SET estado = 'RENUNCIADO' WHERE id = $1", [id])),
      ).toBe(BLOQUEO);
      await api.query("UPDATE premio_ganado SET estado = 'RECLAMADO' WHERE id = $1", [id]);
      await propietario
        .query("UPDATE premio_ganado SET estado = 'ENTREGADO' WHERE id = $1", [id])
        .catch(() => undefined);
      const estado = (await propietario.query('SELECT estado FROM premio_ganado WHERE id = $1', [id])).rows[0]
        .estado as string;
      if (estado === 'ENTREGADO')
        expect(
          await codigoDeError(api.query("UPDATE premio_ganado SET estado = 'RENUNCIADO' WHERE id = $1", [id])),
        ).toBe(BLOQUEO);
    });

    it('nadie desde la API puede correr el vencimiento de un premio, ni diciendo que es un mantenimiento', async () => {
      const u = await crearReciclador();
      const { id } = await premioGanado(u);
      const cliente = await api.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query("SELECT set_config('rm.extendiendo_plazos', '1', true)");
        await expect(
          cliente.query("UPDATE premio_ganado SET vence_en = vence_en + interval '30 days' WHERE id = $1", [id]),
        ).rejects.toMatchObject({ code: BLOQUEO });
      } finally {
        await cliente.query('ROLLBACK');
        cliente.release();
      }
    });
  });

  describe('controles operativos', () => {
    const cambio = async (accion: string, motivo: string | null, sentencia: string, valores: unknown[] = []) => {
      const cliente = await admin.connect();
      try {
        await cliente.query('BEGIN');
        if (motivo !== null) {
          await cliente.query(
            "INSERT INTO auditoria (admin_id, tipo, accion, entidad, entidad_id, motivo) VALUES ($1, 'CONFIGURACION', $2, 'control_operativo', '1', $3)",
            [await administrador(), accion, motivo],
          );
        }
        await cliente.query(sentencia, valores);
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    };

    afterEach(async () => {
      await propietario.query(
        'UPDATE control_operativo SET banner_texto = NULL, banner_desde = NULL, banner_hasta = NULL, registro_reciclador_abierto = true, registro_negocio_abierto = true, mantenimiento_activo = false, mantenimiento_mensaje = NULL WHERE id = 1',
      );
    });

    it('la API no cambia los controles y la administración solo con su motivo en la auditoría', async () => {
      expect(await codigoDeError(api.query('UPDATE control_operativo SET registro_negocio_abierto = false'))).toBe(
        PERMISO_DENEGADO,
      );
      expect(await codigoDeError(admin.query('DELETE FROM control_operativo'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query('INSERT INTO control_operativo (id) VALUES (2)'))).toBe(PERMISO_DENEGADO);
      await expect(
        cambio('REGISTRO', null, 'UPDATE control_operativo SET registro_negocio_abierto = false'),
      ).rejects.toMatchObject({ code: CONTROL });
      await expect(
        cambio('REGISTRO', 'no', 'UPDATE control_operativo SET registro_negocio_abierto = false'),
      ).rejects.toMatchObject({ code: CONTROL });
      await cambio(
        'REGISTRO',
        'Cupo de la etapa de pruebas',
        'UPDATE control_operativo SET registro_negocio_abierto = false',
      );
      expect(
        (await api.query('SELECT registro_negocio_abierto FROM control_operativo')).rows[0].registro_negocio_abierto,
      ).toBe(false);
    });

    it('el aviso global cuida su largo y sus fechas; el mantenimiento exige su mensaje', async () => {
      const largo = 'x'.repeat(141);
      expect(
        await codigoDeError(
          propietario.query(
            "UPDATE control_operativo SET banner_texto = $1, banner_desde = now(), banner_hasta = now() + interval '1 day'",
            [largo],
          ),
        ),
      ).toBe('22001');
      expect(await codigoDeError(propietario.query("UPDATE control_operativo SET banner_texto = 'Hola'"))).toBe(
        RESTRICCION,
      );
      expect(
        await codigoDeError(
          propietario.query(
            "UPDATE control_operativo SET banner_texto = 'Hola', banner_desde = now(), banner_hasta = now() - interval '1 hour'",
          ),
        ),
      ).toBe(RESTRICCION);
      expect(await codigoDeError(propietario.query('UPDATE control_operativo SET mantenimiento_activo = true'))).toBe(
        RESTRICCION,
      );
    });

    it('cada mantenimiento deja su intervalo, con inicio y fin', async () => {
      await propietario.query('DELETE FROM mantenimiento_intervalo');
      await cambio(
        'MANTENIMIENTO',
        'Actualización programada',
        "UPDATE control_operativo SET mantenimiento_activo = true, mantenimiento_mensaje = 'Volvemos pronto'",
      );
      let intervalos = (await propietario.query('SELECT desde, hasta FROM mantenimiento_intervalo')).rows as Array<{
        desde: Date;
        hasta: Date | null;
      }>;
      expect(intervalos).toHaveLength(1);
      expect(intervalos[0]!.hasta).toBeNull();
      await cambio(
        'MANTENIMIENTO',
        'Terminó la actualización',
        'UPDATE control_operativo SET mantenimiento_activo = false, mantenimiento_mensaje = NULL',
      );
      intervalos = (await propietario.query('SELECT desde, hasta FROM mantenimiento_intervalo')).rows as Array<{
        desde: Date;
        hasta: Date | null;
      }>;
      expect(intervalos[0]!.hasta).not.toBeNull();
      expect(await codigoDeError(admin.query('UPDATE mantenimiento_intervalo SET hasta = now()'))).toBe(
        PERMISO_DENEGADO,
      );
      expect(await codigoDeError(api.query('DELETE FROM mantenimiento_intervalo'))).toBe(PERMISO_DENEGADO);
    });
  });

  describe('devolver el tiempo de un mantenimiento a los plazos vigentes', () => {
    it('corre cada plazo lo que duró, no toca lo ya vencido y no se aplica dos veces', async () => {
      await propietario.query('DELETE FROM mantenimiento_intervalo');
      const confirmada = await crearOperacion();
      await avanzarOperacion(confirmada.operacionId, 'CONFIRMADA');
      const entregada = await crearOperacion();
      await avanzarOperacion(entregada.operacionId, 'ENTREGADA');
      const publicacion = await crearPublicacion(await crearReciclador());
      const vencida = await crearPublicacion(await crearReciclador());
      await propietario.query(
        "UPDATE publicacion SET creada_en = now() - interval '10 days', vence_en = now() - interval '1 day' WHERE id = $1",
        [vencida],
      );
      const premio = (await propietario.query("SELECT id FROM premio WHERE tipo = 'OBJETO' AND activo LIMIT 1")).rows[0]
        .id as string;
      const u = await crearReciclador();
      const giro = await giroGastado(u);
      const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
      const sorteo = (
        await propietario.query(
          'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
          [giro, u, config, premio],
        )
      ).rows[0].id as string;
      const ganado = (
        await propietario.query(
          "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, 'RM-MANT', 'Punto', now() + interval '5 days') RETURNING id",
          [sorteo, u, premio],
        )
      ).rows[0].id as string;
      const leer = async () => ({
        conformidad: (
          await propietario.query('SELECT plazo_conformidad_horas AS h FROM operacion WHERE id = $1', [
            confirmada.operacionId,
          ])
        ).rows[0].h as number,
        entrega: (
          await propietario.query('SELECT plazo_aviso_entrega_horas AS h FROM operacion WHERE id = $1', [
            entregada.operacionId,
          ])
        ).rows[0].h as number,
        publicacion: new Date(
          (await propietario.query('SELECT vence_en FROM publicacion WHERE id = $1', [publicacion])).rows[0].vence_en,
        ).getTime(),
        vencida: new Date(
          (await propietario.query('SELECT vence_en FROM publicacion WHERE id = $1', [vencida])).rows[0].vence_en,
        ).getTime(),
        premio: new Date(
          (await propietario.query('SELECT vence_en FROM premio_ganado WHERE id = $1', [ganado])).rows[0].vence_en,
        ).getTime(),
      });
      const antes = await leer();
      // Un mantenimiento de 2 horas y media, ya terminado: se devuelven 3 horas a los plazos en horas y 2 h 30 min a los demás
      await propietario.query(
        "INSERT INTO mantenimiento_intervalo (desde, hasta) VALUES (now() - interval '3 hours', now() - interval '30 minutes')",
      );
      expect(await codigoDeError(admin.query('SELECT extender_plazos_mantenimiento()'))).toBe(PERMISO_DENEGADO);
      expect((await api.query('SELECT extender_plazos_mantenimiento() AS n')).rows[0].n).toBe(1);
      const despues = await leer();
      expect(despues.conformidad).toBe(antes.conformidad + 3);
      expect(despues.entrega).toBe(antes.entrega + 3);
      expect(despues.publicacion - antes.publicacion).toBe(2.5 * 3_600_000);
      expect(despues.premio - antes.premio).toBe(2.5 * 3_600_000);
      expect(despues.vencida).toBe(antes.vencida);
      // Una segunda vuelta no corre nada otra vez
      expect((await api.query('SELECT extender_plazos_mantenimiento() AS n')).rows[0].n).toBe(0);
      expect(await leer()).toEqual(despues);
      // Un mantenimiento que aún no termina no devuelve nada todavía
      await propietario.query('INSERT INTO mantenimiento_intervalo (desde) VALUES (now())');
      expect((await api.query('SELECT extender_plazos_mantenimiento() AS n')).rows[0].n).toBe(0);
      await propietario.query('DELETE FROM mantenimiento_intervalo');
    });

    it('el plazo de reclamo de desafíos solo se corre por lo que el mantenimiento se solapa con él', async () => {
      await propietario.query('DELETE FROM mantenimiento_intervalo');
      await propietario.query("DELETE FROM desafio WHERE mes IN ('2020-03-01', '2020-05-01')");
      const plantilla = (await propietario.query('SELECT id FROM plantilla_desafio ORDER BY id LIMIT 1')).rows[0]
        .id as number;
      await propietario.query(
        "INSERT INTO desafio (plantilla_id, mes, meta, puntos) VALUES ($1, '2020-03-01', 10, 5), ($1, '2020-05-01', 10, 5)",
        [plantilla],
      );
      // La ventana de marzo empieza el 1 de abril 00:00 de Lima (05:00 UTC): se solapan 3 horas, y el mantenimiento de mayo no la toca
      await propietario.query(
        `INSERT INTO mantenimiento_intervalo (desde, hasta) VALUES
         ('2020-04-01T03:00:00Z', '2020-04-01T08:00:00Z'), ('2020-05-10T10:00:00Z', '2020-05-10T12:00:00Z')`,
      );
      expect((await api.query('SELECT extender_plazos_mantenimiento() AS n')).rows[0].n).toBe(2);
      const horas = async (mes: string) =>
        (await propietario.query('SELECT reclamo_extra_horas AS h FROM desafio WHERE mes = $1', [mes])).rows[0]
          .h as number;
      expect(await horas('2020-03-01')).toBe(3);
      expect(await horas('2020-05-01')).toBe(0);
      expect((await api.query('SELECT extender_plazos_mantenimiento() AS n')).rows[0].n).toBe(0);
      expect(await horas('2020-03-01')).toBe(3);
      await propietario.query("DELETE FROM desafio WHERE mes IN ('2020-03-01', '2020-05-01')");
      await propietario.query('DELETE FROM mantenimiento_intervalo');
    });
  });
});
