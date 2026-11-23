import {
  admin,
  api,
  cerrarConexiones,
  codigoDeError,
  crearReciclador,
  giroGastado,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
  sinReglas,
} from './apoyo.js';

const BLOQUEO = 'RM030';
const FUERA_DE_PLAZO = 'RM031';
const SOLO_ADMIN = 'RM032';

let correlativo = 0;
const nombreUnico = (base: string) => `${base} ${Date.now()}-${++correlativo}`;

async function premio(
  datos: {
    tipo?: 'PUNTOS' | 'OBJETO' | 'SIN_PREMIO';
    puntos?: number | null;
    stock?: number | null;
    activo?: boolean;
    desde?: string | null;
    hasta?: string | null;
  } = {},
): Promise<string> {
  const tipo = datos.tipo ?? 'OBJETO';
  const r = await propietario.query(
    `INSERT INTO premio (nombre, tipo, puntos, probabilidad, stock, punto_entrega, vigencia_canje_dias, activo, vigente_desde, vigente_hasta, orden)
     VALUES ($1, $2::premio_tipo, $3, 0, $4, $5, $6, $7, $8, $9, 99) RETURNING id`,
    [
      nombreUnico('Premio de prueba'),
      tipo,
      tipo === 'PUNTOS' ? (datos.puntos ?? 20) : null,
      datos.stock === undefined ? 5 : datos.stock,
      tipo === 'OBJETO' ? 'Acopio de prueba' : null,
      tipo === 'OBJETO' ? 30 : null,
      datos.activo ?? true,
      datos.desde ?? null,
      datos.hasta ?? null,
    ],
  );
  return r.rows[0].id as string;
}

const configuracion = async () =>
  (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;

// Gasta un giro y registra el sorteo con la conexión indicada, como lo hace la API
async function sortear(
  conexion: typeof api,
  usuarioId: string,
  premioId: string,
  opciones: { giroId?: string; creadoEn?: string } = {},
): Promise<string> {
  const giroId = opciones.giroId ?? (await giroGastado(usuarioId));
  const r = await conexion.query(
    `INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id, creado_en)
     VALUES ($1, $2, $3, 4321, $4, COALESCE($5::timestamptz, now())) RETURNING id`,
    [giroId, usuarioId, await configuracion(), premioId, opciones.creadoEn ?? null],
  );
  return r.rows[0].id as string;
}

async function stockDe(premioId: string): Promise<number | null> {
  return (await propietario.query('SELECT stock FROM premio WHERE id = $1', [premioId])).rows[0].stock as number | null;
}

async function premioGanado(
  usuarioId: string,
  opciones: { venceEn?: string; creadoEn?: string } = {},
): Promise<{ id: string; sorteoId: string; premioId: string }> {
  const premioId = await premio({ tipo: 'OBJETO', stock: 10 });
  const sorteoId = await sortear(api, usuarioId, premioId);
  const r = await api.query(
    `INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en, creado_en)
     VALUES ($1, $2, $3, $4, 'Acopio de prueba', COALESCE($5::timestamptz, now() + interval '30 days'), COALESCE($6::timestamptz, now()))
     RETURNING id`,
    [
      sorteoId,
      usuarioId,
      premioId,
      `RM-${String(++correlativo).padStart(4, '0')}`,
      opciones.venceEn ?? null,
      opciones.creadoEn ?? null,
    ],
  );
  return { id: r.rows[0].id as string, sorteoId, premioId };
}

describe('Giros, ruleta y premios en la base de datos (Fase 10B)', () => {
  afterAll(cerrarConexiones);

  describe('los giros nacen de puntos de reciclaje o de la Meta del mes', () => {
    it('un giro por puntos exige los puntos de reciclaje que lo dan', async () => {
      const reciclador = await crearReciclador();
      const insertar = (numero: number) =>
        api.query("INSERT INTO giro (usuario_id, origen, numero) VALUES ($1, 'PUNTOS', $2)", [reciclador, numero]);
      expect(await codigoDeError(insertar(1))).toBe(RESTRICCION);
      await sinReglas((c) =>
        c.query('UPDATE reciclador_perfil SET puntos = 500, puntos_reciclaje = 500 WHERE usuario_id = $1', [
          reciclador,
        ]),
      );
      expect(await codigoDeError(insertar(1))).toBeUndefined();
      expect(await codigoDeError(insertar(2))).toBe(RESTRICCION);
    });

    it('el giro de la Meta del mes exige haberla reclamado', async () => {
      const reciclador = await crearReciclador();
      const desafio = (await propietario.query('SELECT id FROM desafio WHERE es_meta_mes LIMIT 1')).rows[0]
        .id as string;
      const insertar = () =>
        api.query("INSERT INTO giro (usuario_id, origen, desafio_id) VALUES ($1, 'META_MES', $2)", [
          reciclador,
          desafio,
        ]);
      expect(await codigoDeError(insertar())).toBe(RESTRICCION);
      await api.query('INSERT INTO usuario_desafio (usuario_id, desafio_id, completado_en) VALUES ($1, $2, now())', [
        reciclador,
        desafio,
      ]);
      expect(await codigoDeError(insertar())).toBe(RESTRICCION);
      await api.query('UPDATE usuario_desafio SET reclamado_en = now() WHERE usuario_id = $1', [reciclador]);
      expect(await codigoDeError(insertar())).toBeUndefined();
      // La Meta del mes da un solo giro por persona
      expect(await codigoDeError(insertar())).toBe('23505');
    });

    it('ni la API ni la administración borran un giro, y solo se marca como usado una vez', async () => {
      const reciclador = await crearReciclador();
      const giro = await giroGastado(reciclador, false);
      for (const conexion of [api, admin]) {
        expect(await codigoDeError(conexion.query('DELETE FROM giro WHERE id = $1', [giro]))).toBe(PERMISO_DENEGADO);
      }
      expect(await codigoDeError(api.query('UPDATE giro SET numero = 99 WHERE id = $1', [giro]))).toBe(BLOQUEO);
      expect(await codigoDeError(api.query('UPDATE giro SET usado_en = NULL WHERE id = $1', [giro]))).toBe(BLOQUEO);
      expect(await codigoDeError(api.query('UPDATE giro SET usado_en = now() WHERE id = $1', [giro]))).toBeUndefined();
      expect(await codigoDeError(api.query('UPDATE giro SET usado_en = now() WHERE id = $1', [giro]))).toBe(BLOQUEO);
    });
  });

  describe('el sorteo gasta un giro propio y nadie edita premios ni stock', () => {
    it('la API solo lee los premios y la administración no registra sorteos', async () => {
      const id = await premio();
      for (const sql of [
        `UPDATE premio SET stock = 999 WHERE id = '${id}'`,
        `UPDATE premio SET probabilidad = 50 WHERE id = '${id}'`,
        `DELETE FROM premio WHERE id = '${id}'`,
        "INSERT INTO premio (nombre, tipo, probabilidad, orden) VALUES ('X', 'SIN_PREMIO', 0, 1)",
      ]) {
        expect(await codigoDeError(api.query(sql))).toBe(PERMISO_DENEGADO);
      }
      const reciclador = await crearReciclador();
      expect(await codigoDeError(sortear(admin, reciclador, id))).toBe(PERMISO_DENEGADO);
      // Desde la Fase 12B la administración repone stock solo con su constancia de auditoría
      expect(await codigoDeError(admin.query(`UPDATE premio SET stock = 7 WHERE id = '${id}'`))).toBe('RM039');
    });

    it('un sorteo exige un giro propio ya gastado', async () => {
      const dueno = await crearReciclador();
      const otro = await crearReciclador();
      const id = await premio({ tipo: 'SIN_PREMIO', stock: null });
      expect(await codigoDeError(sortear(api, otro, id, { giroId: await giroGastado(dueno) }))).toBe(RESTRICCION);
      expect(await codigoDeError(sortear(api, dueno, id, { giroId: await giroGastado(dueno, false) }))).toBe(
        RESTRICCION,
      );
      const giro = await giroGastado(dueno);
      await sortear(api, dueno, id, { giroId: giro });
      expect(await codigoDeError(sortear(api, dueno, id, { giroId: giro }))).toBe('23505');
    });

    it('solo gira una cuenta activa con teléfono verificado', async () => {
      const sinTelefono = await crearReciclador();
      await propietario.query('UPDATE usuario SET telefono_verificado_en = NULL WHERE id = $1', [sinTelefono]);
      const sinActivar = await crearReciclador();
      await propietario.query("UPDATE usuario SET estado = 'PENDIENTE_TELEFONO' WHERE id = $1", [sinActivar]);
      const id = await premio({ tipo: 'SIN_PREMIO', stock: null });
      expect(await codigoDeError(sortear(api, sinTelefono, id))).toBe(RESTRICCION);
      expect(await codigoDeError(sortear(api, sinActivar, id))).toBe(RESTRICCION);
    });

    it('el registro de un sorteo guarda su azar, la clave de la solicitud y una foto de la ruleta', async () => {
      const reciclador = await crearReciclador();
      const id = await premio({ tipo: 'SIN_PREMIO', stock: null });
      const giro = await giroGastado(reciclador);
      await api.query(
        `INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id, clave_solicitud, instantanea)
         VALUES ($1, $2, $3, 777, $4, 'clave-1', '{"escala":10000,"premios":[]}'::jsonb)`,
        [giro, reciclador, await configuracion(), id],
      );
      const fila = (
        await api.query(
          'SELECT numero_sorteado, clave_solicitud, instantanea FROM sorteo_ruleta WHERE clave_solicitud = $1',
          ['clave-1'],
        )
      ).rows[0];
      expect(fila.numero_sorteado).toBe(777);
      expect(fila.instantanea.escala).toBe(10000);
      // Una misma clave no registra dos sorteos de la misma persona
      expect(
        await codigoDeError(
          api.query(
            `INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id, clave_solicitud)
             VALUES ($1, $2, $3, 1, $4, 'clave-1')`,
            [await giroGastado(reciclador), reciclador, await configuracion(), id],
          ),
        ),
      ).toBe('23505');
    });
  });

  describe('stock y campaña de cada premio', () => {
    it('el sorteo descuenta una unidad y la última no sale dos veces', async () => {
      const id = await premio({ stock: 1 });
      const a = await crearReciclador();
      const b = await crearReciclador();
      await sortear(api, a, id);
      expect(await stockDe(id)).toBe(0);
      expect(await codigoDeError(sortear(api, b, id))).toBe(RESTRICCION);
      expect(await stockDe(id)).toBe(0);
    });

    it('con varios giros simultáneos sobre la última unidad solo uno gana y el stock nunca baja de cero', async () => {
      const id = await premio({ stock: 1 });
      const recicladores = await Promise.all(Array.from({ length: 6 }, () => crearReciclador()));
      const giros = await Promise.all(recicladores.map((r) => giroGastado(r)));
      const resultados = await Promise.all(
        recicladores.map((r, i) => codigoDeError(sortear(api, r, id, { giroId: giros[i]! }))),
      );
      expect(resultados.filter((r) => r === undefined)).toHaveLength(1);
      expect(resultados.filter((r) => r === RESTRICCION)).toHaveLength(5);
      expect(await stockDe(id)).toBe(0);
    });

    it('un premio sin límite no cambia su stock', async () => {
      const id = await premio({ tipo: 'PUNTOS', puntos: 10, stock: null });
      await sortear(api, await crearReciclador(), id);
      expect(await stockDe(id)).toBeNull();
    });

    it('un premio inactivo o fuera de su campaña no puede salir; "Sigue intentando" siempre puede', async () => {
      const reciclador = await crearReciclador();
      const inactivo = await premio({ activo: false });
      const vencido = await premio({ hasta: '2020-01-01T00:00:00Z' });
      const futuro = await premio({ desde: '2099-01-01T00:00:00Z' });
      const vigente = await premio({ desde: '2020-01-01T00:00:00Z', hasta: '2099-01-01T00:00:00Z' });
      for (const id of [inactivo, vencido, futuro]) {
        expect(await codigoDeError(sortear(api, reciclador, id))).toBe(RESTRICCION);
        expect(await stockDe(id)).toBe(5);
      }
      expect(await codigoDeError(sortear(api, reciclador, vigente))).toBeUndefined();
      const sinPremio = await premio({ tipo: 'SIN_PREMIO', stock: null, activo: false });
      expect(await codigoDeError(sortear(api, reciclador, sinPremio))).toBeUndefined();
    });

    it('la campaña debe empezar antes de terminar', async () => {
      expect(await codigoDeError(premio({ desde: '2030-01-01T00:00:00Z', hasta: '2029-01-01T00:00:00Z' }))).toBe(
        RESTRICCION,
      );
    });
  });

  describe('puntos de la ruleta', () => {
    it('solo salen de un sorteo propio con premio de puntos y por los puntos del premio', async () => {
      const reciclador = await crearReciclador();
      const otro = await crearReciclador();
      const conPuntos = await premio({ tipo: 'PUNTOS', puntos: 20, stock: null });
      const conObjeto = await premio({ tipo: 'OBJETO' });
      const sorteoDePuntos = await sortear(api, reciclador, conPuntos);
      const sorteoDeObjeto = await sortear(api, reciclador, conObjeto);
      const insertar = (usuario: string, puntos: number, sorteo: string | null) =>
        api.query(
          `INSERT INTO movimiento_puntos (usuario_id, puntos, motivo, cuenta_para_giros, sorteo_id)
           VALUES ($1, $2, 'RULETA', false, $3)`,
          [usuario, puntos, sorteo],
        );
      expect(await codigoDeError(insertar(reciclador, 20, null))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar(reciclador, 99, sorteoDePuntos))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar(otro, 20, sorteoDePuntos))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar(reciclador, 20, sorteoDeObjeto))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar(reciclador, 20, sorteoDePuntos))).toBeUndefined();
      // Un sorteo paga una sola vez
      expect(await codigoDeError(insertar(reciclador, 20, sorteoDePuntos))).toBe('23505');
    });

    it('los puntos de la ruleta no cuentan para ganar giros', async () => {
      const reciclador = await crearReciclador();
      const sorteo = await sortear(api, reciclador, await premio({ tipo: 'PUNTOS', puntos: 50, stock: null }));
      expect(
        await codigoDeError(
          api.query(
            `INSERT INTO movimiento_puntos (usuario_id, puntos, motivo, cuenta_para_giros, sorteo_id)
             VALUES ($1, 50, 'RULETA', true, $2)`,
            [reciclador, sorteo],
          ),
        ),
      ).toBe(RESTRICCION);
    });
  });

  describe('invitación: puntos de bono para quien invita y para el invitado', () => {
    it('solo se pagan cuando el invitado completó su primera operación', async () => {
      const invitador = await crearReciclador();
      const invitado = await crearReciclador();
      const pagar = (usuario: string) =>
        api.query(
          `INSERT INTO movimiento_puntos (usuario_id, puntos, motivo, cuenta_para_giros, invitado_id)
           VALUES ($1, 10, 'INVITACION', false, $2)`,
          [usuario, invitado],
        );
      await propietario.query('INSERT INTO invitacion (invitador_id, invitado_id) VALUES ($1, $2)', [
        invitador,
        invitado,
      ]);
      expect(await codigoDeError(pagar(invitador))).toBe(RESTRICCION);
      expect(await codigoDeError(pagar(invitado))).toBe(RESTRICCION);
      await propietario.query('UPDATE invitacion SET contada_en = now() WHERE invitado_id = $1', [invitado]);
      expect(await codigoDeError(pagar(invitador))).toBeUndefined();
      expect(await codigoDeError(pagar(invitado))).toBeUndefined();
      // Una tercera persona no cobra por esa invitación
      expect(await codigoDeError(pagar(await crearReciclador()))).toBe(RESTRICCION);
    });
  });

  describe('premios ganados: Ganado → Reclamado → Entregado, o Vencido', () => {
    it('nace solo del sorteo de un premio con objeto de la misma persona', async () => {
      const reciclador = await crearReciclador();
      const otro = await crearReciclador();
      const conPuntos = await premio({ tipo: 'PUNTOS', puntos: 10, stock: null });
      const sorteoDePuntos = await sortear(api, reciclador, conPuntos);
      const insertar = (usuario: string, sorteo: string, premioId: string, vence = "now() + interval '1 day'") =>
        api.query(
          `INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en)
           VALUES ($1, $2, $3, $4, 'Acopio', ${vence})`,
          [sorteo, usuario, premioId, `RM-X${++correlativo}`],
        );
      expect(await codigoDeError(insertar(reciclador, sorteoDePuntos, conPuntos))).toBe(RESTRICCION);
      const objeto = await premio({ tipo: 'OBJETO' });
      const sorteoDeObjeto = await sortear(api, reciclador, objeto);
      expect(await codigoDeError(insertar(otro, sorteoDeObjeto, objeto))).toBe(RESTRICCION);
      expect(await codigoDeError(insertar(reciclador, sorteoDeObjeto, objeto, "now() - interval '1 day'"))).toBe(
        RESTRICCION,
      );
      expect(await codigoDeError(insertar(reciclador, sorteoDeObjeto, objeto))).toBeUndefined();
    });

    it('el dueño lo reclama dentro del plazo y solo administración lo marca como entregado', async () => {
      const reciclador = await crearReciclador();
      const { id } = await premioGanado(reciclador);
      const cambiar = (conexion: typeof api, estado: string) =>
        conexion.query('UPDATE premio_ganado SET estado = $2::premio_ganado_estado WHERE id = $1', [id, estado]);
      expect(await codigoDeError(cambiar(api, 'ENTREGADO'))).toBe(BLOQUEO);
      expect(await codigoDeError(cambiar(api, 'RECLAMADO'))).toBeUndefined();
      const reclamado = (await propietario.query('SELECT reclamado_en FROM premio_ganado WHERE id = $1', [id])).rows[0];
      expect(reclamado.reclamado_en).not.toBeNull();
      expect(await codigoDeError(cambiar(api, 'ENTREGADO'))).toBe(SOLO_ADMIN);
      expect(await codigoDeError(cambiar(admin, 'ENTREGADO'))).toBe('RM039');
      await propietario.query("UPDATE premio_ganado SET estado = 'ENTREGADO' WHERE id = $1", [id]);
      const entregado = (await propietario.query('SELECT estado, entregado_en FROM premio_ganado WHERE id = $1', [id]))
        .rows[0];
      expect(entregado.estado).toBe('ENTREGADO');
      expect(entregado.entregado_en).not.toBeNull();
      // Ya no cambia
      for (const estado of ['POR_RECLAMAR', 'RECLAMADO', 'VENCIDO']) {
        expect(await codigoDeError(cambiar(admin, estado))).toBe(BLOQUEO);
      }
    });

    it('un premio vencido no se puede reclamar y uno vigente no se puede vencer', async () => {
      const reciclador = await crearReciclador();
      const vigente = await premioGanado(reciclador);
      expect(
        await codigoDeError(api.query("UPDATE premio_ganado SET estado = 'VENCIDO' WHERE id = $1", [vigente.id])),
      ).toBe(FUERA_DE_PLAZO);

      const vencido = await premioGanado(reciclador, {
        creadoEn: '2026-01-01T00:00:00Z',
        venceEn: '2026-01-31T00:00:00Z',
      });
      expect(
        await codigoDeError(api.query("UPDATE premio_ganado SET estado = 'RECLAMADO' WHERE id = $1", [vencido.id])),
      ).toBe(FUERA_DE_PLAZO);
      expect(
        await codigoDeError(api.query("UPDATE premio_ganado SET estado = 'VENCIDO' WHERE id = $1", [vencido.id])),
      ).toBeUndefined();
      expect(
        await codigoDeError(api.query("UPDATE premio_ganado SET estado = 'RECLAMADO' WHERE id = $1", [vencido.id])),
      ).toBe(BLOQUEO);
    });

    it('los datos del premio ganado no se modifican y nadie lo borra', async () => {
      const reciclador = await crearReciclador();
      const { id } = await premioGanado(reciclador);
      for (const columna of [
        "codigo = 'RM-ZZZZ'",
        "punto_entrega = 'Otro lugar'",
        "vence_en = now() + interval '90 days'",
      ]) {
        expect(await codigoDeError(api.query(`UPDATE premio_ganado SET ${columna} WHERE id = $1`, [id]))).toBe(BLOQUEO);
      }
      expect(await codigoDeError(api.query('UPDATE premio_ganado SET entregado_en = now() WHERE id = $1', [id]))).toBe(
        BLOQUEO,
      );
      for (const conexion of [api, admin]) {
        expect(await codigoDeError(conexion.query('DELETE FROM premio_ganado WHERE id = $1', [id]))).toBe(
          PERMISO_DENEGADO,
        );
      }
    });
  });

  describe('el registro de sorteos', () => {
    it('ni la API ni la administración ni el dueño lo cambian o lo borran', async () => {
      const reciclador = await crearReciclador();
      await sortear(api, reciclador, await premio({ tipo: 'SIN_PREMIO', stock: null }));
      for (const conexion of [api, admin]) {
        expect(await codigoDeError(conexion.query('UPDATE sorteo_ruleta SET premio_id = premio_id'))).toBe(
          PERMISO_DENEGADO,
        );
        expect(await codigoDeError(conexion.query('DELETE FROM sorteo_ruleta'))).toBe(PERMISO_DENEGADO);
      }
      expect(await codigoDeError(propietario.query('UPDATE sorteo_ruleta SET numero_sorteado = 1'))).toBe(BLOQUEO);
      expect(await codigoDeError(propietario.query('DELETE FROM sorteo_ruleta'))).toBe(BLOQUEO);
    });
  });
});
