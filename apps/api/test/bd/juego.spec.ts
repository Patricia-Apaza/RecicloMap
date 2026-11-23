import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  admin,
  api,
  avanzarOperacion,
  cerrarConexiones,
  codigoDeError,
  crearOferta,
  crearOperacion,
  crearPublicacion,
  crearReciclador,
  material,
  negocio,
  operacionCompletada,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
  UNICO,
} from './apoyo.js';

const filas = async <T>(consulta: Promise<{ rows: unknown[] }>): Promise<T[]> => (await consulta).rows as T[];

async function entregaConfirmada(recicladorId: string, kgConfirmado = 200) {
  const { id: compradorId } = await negocio('Acopio Titicaca');
  const r = await propietario.query(
    `INSERT INTO registro_reciclaje (reciclador_id, comprador_id, material_id, kg, kg_confirmado, fecha, estado, resuelto_en, vence_en)
     VALUES ($1, $2, $3, $4, $4, current_date, 'CONFIRMADO', now(), now() + interval '7 days') RETURNING id`,
    [recicladorId, compradorId, await material('pet'), kgConfirmado],
  );
  return (r.rows[0] as { id: string }).id;
}

const insertarMovimiento = (
  conexion: typeof api,
  usuarioId: string,
  puntos: number,
  motivo: string,
  extra: { operacionId?: string; registroId?: string; desafioId?: string; invitadoId?: string } = {},
) =>
  conexion.query(
    `INSERT INTO movimiento_puntos (usuario_id, puntos, motivo, cuenta_para_giros, operacion_id, registro_id, desafio_id, invitado_id)
     VALUES ($1, $2, $3::puntos_motivo, $4, $5, $6, $7, $8)`,
    [
      usuarioId,
      puntos,
      motivo,
      motivo === 'OPERACION' || motivo === 'REGISTRO_DIRECTO',
      extra.operacionId ?? null,
      extra.registroId ?? null,
      extra.desafioId ?? null,
      extra.invitadoId ?? null,
    ],
  );

describe('Puntos, niveles y entrega directa en la base de datos (Fase 10A)', () => {
  afterAll(cerrarConexiones);

  describe('el libro de movimientos solo crece', () => {
    it('ni la API ni la administración editan o borran un movimiento', async () => {
      const op = await operacionCompletada();
      await insertarMovimiento(propietario, op.recicladorId, 34, 'OPERACION', { operacionId: op.operacionId });
      for (const conexion of [api, admin]) {
        expect(await codigoDeError(conexion.query('UPDATE movimiento_puntos SET puntos = 999'))).toBe(PERMISO_DENEGADO);
        expect(await codigoDeError(conexion.query('DELETE FROM movimiento_puntos'))).toBe(PERMISO_DENEGADO);
        expect(await codigoDeError(conexion.query('TRUNCATE movimiento_puntos'))).toBe(PERMISO_DENEGADO);
      }
    });

    it('un movimiento no puede quedar en cero', async () => {
      const op = await operacionCompletada();
      expect(
        await codigoDeError(
          insertarMovimiento(propietario, op.recicladorId, 0, 'OPERACION', { operacionId: op.operacionId }),
        ),
      ).toBe(RESTRICCION);
    });
  });

  describe('nadie escribe puntos sin un hecho que los justifique', () => {
    it.each([
      ['la API', api],
      ['la administración', admin],
    ])(
      '%s no puede inventar puntos de operación, entrega, desafío, invitación, ruleta ni corrección',
      async (_nombre, conexion) => {
        const reciclador = await crearReciclador();
        const otro = await crearReciclador();
        const enCurso = await crearOperacion();
        const completada = await operacionCompletada(34);
        const sinFondo = [
          () => insertarMovimiento(conexion, reciclador, 100, 'OPERACION'),
          // Operación que existe pero no está completada
          () =>
            insertarMovimiento(conexion, enCurso.recicladorId, 34, 'OPERACION', { operacionId: enCurso.operacionId }),
          // Operación completada de otra persona
          () => insertarMovimiento(conexion, reciclador, 34, 'OPERACION', { operacionId: completada.operacionId }),
          // Puntos distintos a 1 por kg
          () =>
            insertarMovimiento(conexion, completada.recicladorId, 500, 'OPERACION', {
              operacionId: completada.operacionId,
            }),
          () => insertarMovimiento(conexion, reciclador, 50, 'REGISTRO_DIRECTO'),
          () => insertarMovimiento(conexion, reciclador, 30, 'DESAFIO'),
          () => insertarMovimiento(conexion, reciclador, 10, 'INVITACION', { invitadoId: otro }),
          () => insertarMovimiento(conexion, reciclador, 25, 'RULETA'),
          () => insertarMovimiento(conexion, reciclador, -50, 'CORRECCION'),
        ];
        for (const intento of sinFondo) expect(await codigoDeError(intento())).toBe(RESTRICCION);
      },
    );

    it('los puntos de una operación son exactamente 1 por kg confirmado, una sola vez', async () => {
      const op = await operacionCompletada(34);
      await insertarMovimiento(api, op.recicladorId, 34, 'OPERACION', { operacionId: op.operacionId });
      expect(
        await codigoDeError(insertarMovimiento(api, op.recicladorId, 34, 'OPERACION', { operacionId: op.operacionId })),
      ).toBe(UNICO);
    });

    it('el saldo del perfil debe coincidir con el libro: no se edita a mano', async () => {
      const op = await operacionCompletada(34);
      for (const conexion of [propietario, api, admin]) {
        expect(
          await codigoDeError(
            conexion.query(
              'UPDATE reciclador_perfil SET puntos = 9999, puntos_reciclaje = 9999 WHERE usuario_id = $1',
              [op.recicladorId],
            ),
          ),
        ).toBe(RESTRICCION);
      }
      // Con el movimiento y el saldo en la misma transacción sí cuadra
      const cliente = await api.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query(
          `INSERT INTO movimiento_puntos (usuario_id, puntos, motivo, cuenta_para_giros, operacion_id)
           VALUES ($1, 34, 'OPERACION', true, $2)`,
          [op.recicladorId, op.operacionId],
        );
        await cliente.query(
          'UPDATE reciclador_perfil SET puntos = 34, puntos_reciclaje = 34, kg_total = 34 WHERE usuario_id = $1',
          [op.recicladorId],
        );
        await cliente.query('COMMIT');
      } finally {
        cliente.release();
      }
      const [perfil] = await filas<{ puntos: number; nivel_id: number }>(
        propietario.query('SELECT puntos, nivel_id FROM reciclador_perfil WHERE usuario_id = $1', [op.recicladorId]),
      );
      expect(perfil).toEqual({ puntos: 34, nivel_id: 1 });
    });

    it('la administración no escribe insignias, desafíos, entregas directas ni toca los giros', async () => {
      const reciclador = await crearReciclador();
      const { id: compradorId } = await negocio('Acopio Titicaca');
      expect(
        await codigoDeError(
          admin.query('INSERT INTO usuario_insignia (usuario_id, insignia_id) VALUES ($1, 1)', [reciclador]),
        ),
      ).toBe(PERMISO_DENEGADO);
      expect(
        await codigoDeError(
          admin.query(
            `INSERT INTO registro_reciclaje (reciclador_id, comprador_id, material_id, kg, fecha, vence_en)
             VALUES ($1, $2, $3, 10, current_date, now() + interval '7 days')`,
            [reciclador, compradorId, await material('pet')],
          ),
        ),
      ).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query("UPDATE registro_reciclaje SET estado = 'CONFIRMADO'"))).toBe(
        PERMISO_DENEGADO,
      );
      expect(
        await codigoDeError(
          admin.query('INSERT INTO usuario_desafio (usuario_id, desafio_id) VALUES ($1, gen_random_uuid())', [
            reciclador,
          ]),
        ),
      ).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query('UPDATE desafio SET puntos = 9999'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query('UPDATE giro SET usado_en = now()'))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(admin.query('DELETE FROM giro'))).toBe(PERMISO_DENEGADO);
    });
  });

  describe('niveles por kilos acumulados', () => {
    it.each([
      [0, 1],
      [49.99, 1],
      [50, 2],
      [199.99, 2],
      [200, 3],
      [499.99, 3],
      [500, 4],
      [999.99, 4],
      [1000, 5],
      [2499.99, 5],
      [2500, 6],
    ])('con %s kg el nivel es %s', async (kg, nivel) => {
      const reciclador = await crearReciclador();
      await propietario.query('UPDATE reciclador_perfil SET kg_total = $2 WHERE usuario_id = $1', [reciclador, kg]);
      const [fila] = await filas<{ nivel_id: number }>(
        propietario.query('SELECT nivel_id FROM reciclador_perfil WHERE usuario_id = $1', [reciclador]),
      );
      expect(fila!.nivel_id).toBe(nivel);
    });

    it('el nivel no se puede fijar a mano: siempre sale de los kilos', async () => {
      const reciclador = await crearReciclador();
      await propietario.query('UPDATE reciclador_perfil SET kg_total = 10, nivel_id = 6 WHERE usuario_id = $1', [
        reciclador,
      ]);
      const [fila] = await filas<{ nivel_id: number }>(
        propietario.query('SELECT nivel_id FROM reciclador_perfil WHERE usuario_id = $1', [reciclador]),
      );
      expect(fila!.nivel_id).toBe(1);
    });
  });

  describe('entrega directa', () => {
    it('el tope diario de puntos por registro directo se aplica en la base', async () => {
      const reciclador = await crearReciclador();
      const registro = await entregaConfirmada(reciclador, 400);
      await insertarMovimiento(api, reciclador, 100, 'REGISTRO_DIRECTO', { registroId: registro });
      expect(
        await codigoDeError(insertarMovimiento(api, reciclador, 100, 'REGISTRO_DIRECTO', { registroId: registro })),
      ).toBe(RESTRICCION);
    });

    it('un registro directo da como máximo 1 punto por kilo confirmado y solo si está confirmado', async () => {
      const reciclador = await crearReciclador();
      const { id: compradorId } = await negocio('Acopio Titicaca');
      const pendiente = await propietario.query(
        `INSERT INTO registro_reciclaje (reciclador_id, comprador_id, material_id, kg, fecha, vence_en)
         VALUES ($1, $2, $3, 10, current_date, now() + interval '7 days') RETURNING id`,
        [reciclador, compradorId, await material('carton')],
      );
      const idPendiente = (pendiente.rows[0] as { id: string }).id;
      expect(
        await codigoDeError(insertarMovimiento(api, reciclador, 10, 'REGISTRO_DIRECTO', { registroId: idPendiente })),
      ).toBe(RESTRICCION);
      const confirmado = await entregaConfirmada(reciclador, 20);
      expect(
        await codigoDeError(insertarMovimiento(api, reciclador, 21, 'REGISTRO_DIRECTO', { registroId: confirmado })),
      ).toBe(RESTRICCION);
      await insertarMovimiento(api, reciclador, 20, 'REGISTRO_DIRECTO', { registroId: confirmado });
    });

    it('los kilos son de 1 a 5 000, no se repite un pendiente igual y un rechazo lleva motivo', async () => {
      const reciclador = await crearReciclador();
      const { id: compradorId } = await negocio('Acopio Titicaca');
      const pet = await material('pet');
      const nuevo = (kg: number) =>
        propietario.query(
          `INSERT INTO registro_reciclaje (reciclador_id, comprador_id, material_id, kg, fecha, vence_en)
           VALUES ($1, $2, $3, $4, current_date, now() + interval '7 days')`,
          [reciclador, compradorId, pet, kg],
        );
      expect(await codigoDeError(nuevo(0))).toBe(RESTRICCION);
      expect(await codigoDeError(nuevo(5001))).toBe(RESTRICCION);
      await nuevo(10);
      expect(await codigoDeError(nuevo(10))).toBe(UNICO);
      expect(
        await codigoDeError(
          propietario.query("UPDATE registro_reciclaje SET estado = 'RECHAZADO' WHERE reciclador_id = $1", [
            reciclador,
          ]),
        ),
      ).toBe(RESTRICCION);
    });
  });

  describe('invitaciones y desafíos', () => {
    it('un desafío solo se reclama si está completado y los giros por meta llevan su desafío', async () => {
      const reciclador = await crearReciclador();
      const [desafio] = await filas<{ id: string }>(propietario.query('SELECT id FROM desafio LIMIT 1'));
      expect(
        await codigoDeError(
          propietario.query(
            'INSERT INTO usuario_desafio (usuario_id, desafio_id, reclamado_en) VALUES ($1, $2, now())',
            [reciclador, desafio!.id],
          ),
        ),
      ).toBe(RESTRICCION);
      expect(
        await codigoDeError(
          propietario.query("INSERT INTO giro (usuario_id, origen) VALUES ($1, 'META_MES')", [reciclador]),
        ),
      ).toBe(RESTRICCION);
    });

    it('un invitado solo cuenta una vez por quien lo invitó', async () => {
      const invitador = await crearReciclador();
      const invitado = await crearReciclador();
      await propietario.query('INSERT INTO invitacion (invitador_id, invitado_id, contada_en) VALUES ($1, $2, now())', [
        invitador,
        invitado,
      ]);
      await insertarMovimiento(api, invitador, 10, 'INVITACION', { invitadoId: invitado });
      expect(await codigoDeError(insertarMovimiento(api, invitador, 10, 'INVITACION', { invitadoId: invitado }))).toBe(
        UNICO,
      );
    });
  });

  describe('histórico: las operaciones ya completadas generan sus puntos y nivel al migrar', () => {
    const migracion = readFileSync(
      join(process.cwd(), 'prisma/migrations/20261120000001_puntos_insignias_y_entrega_directa/migration.sql'),
      'utf8',
    );
    const inicio = migracion.indexOf('-- Historial: cada operación completada');
    const fin = migracion.indexOf('-- El nivel sale siempre');
    const retroalimentar = migracion.slice(inicio, fin);

    it('el script de la migración encuentra su bloque', () => {
      expect(inicio).toBeGreaterThan(0);
      expect(fin).toBeGreaterThan(inicio);
    });

    it('genera el movimiento, los kilos, los puntos y el nivel de una operación completada sin libro, y no se duplica', async () => {
      const op = await operacionCompletada(120);
      // Lo completado antes de esta fase no tiene movimiento ni totales
      expect(
        await filas(propietario.query('SELECT 1 FROM movimiento_puntos WHERE operacion_id = $1', [op.operacionId])),
      ).toHaveLength(0);
      await propietario.query(retroalimentar);
      await propietario.query(retroalimentar);
      const movimientos = await filas<{ puntos: number; creado_en: Date }>(
        propietario.query('SELECT puntos, creado_en FROM movimiento_puntos WHERE operacion_id = $1', [op.operacionId]),
      );
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]!.puntos).toBe(120);
      const [perfil] = await filas<{
        kg_total: string;
        puntos: number;
        puntos_reciclaje: number;
        nivel_id: number;
        operaciones_completadas: number;
      }>(
        propietario.query(
          'SELECT kg_total, puntos, puntos_reciclaje, nivel_id, operaciones_completadas FROM reciclador_perfil WHERE usuario_id = $1',
          [op.recicladorId],
        ),
      );
      expect(Number(perfil!.kg_total)).toBe(120);
      expect(perfil).toMatchObject({ puntos: 120, puntos_reciclaje: 120, nivel_id: 2, operaciones_completadas: 1 });
    });

    it('una anulada o sin kilos finales no genera nada y 500 puntos acumulados generan su giro', async () => {
      const anulada = await crearOperacion();
      await propietario.query(
        "UPDATE operacion SET estado = 'CANCELADA', motivo_cancelacion = 'x', cancelada_por_id = $2, cancelada_en = now() WHERE id = $1",
        [anulada.operacionId, anulada.recicladorId],
      );
      const reciclador = await crearReciclador();
      const compradorId = (await negocio('Acopio Titicaca')).id;
      for (const kg of [300, 250]) {
        const publicacion = await crearPublicacion(reciclador, { kg });
        const oferta = await crearOferta(publicacion, compradorId);
        await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [oferta]);
        await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacion]);
        const nueva = await propietario.query(
          'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4) RETURNING id',
          [publicacion, oferta, reciclador, compradorId],
        );
        const id = (nueva.rows[0] as { id: string }).id;
        await avanzarOperacion(id, 'ENTREGADA');
        await propietario.query(
          "UPDATE operacion SET estado = 'CONFIRMADA', kg_final = $2, monto_final = 100 WHERE id = $1",
          [id, kg],
        );
        await propietario.query("UPDATE operacion SET estado = 'COMPLETADA', completada_en = now() WHERE id = $1", [
          id,
        ]);
      }
      await propietario.query(retroalimentar);
      expect(
        await filas(
          propietario.query('SELECT 1 FROM movimiento_puntos WHERE operacion_id = $1', [anulada.operacionId]),
        ),
      ).toHaveLength(0);
      const [perfil] = await filas<{ puntos: number; nivel_id: number }>(
        propietario.query('SELECT puntos, nivel_id FROM reciclador_perfil WHERE usuario_id = $1', [reciclador]),
      );
      expect(perfil).toEqual({ puntos: 550, nivel_id: 4 });
      const giros = await filas(
        propietario.query("SELECT 1 FROM giro WHERE usuario_id = $1 AND origen = 'PUNTOS'", [reciclador]),
      );
      expect(giros).toHaveLength(1);
    });
  });
});
