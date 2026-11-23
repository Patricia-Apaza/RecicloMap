import { PARAMETROS_EDITABLES } from '@reciclomap/shared';
import {
  admin,
  administrador,
  api,
  cerrarConexiones,
  codigoDeError,
  crearReciclador,
  giroGastado,
  PERMISO_DENEGADO,
  propietario,
  RESTRICCION,
} from './apoyo.js';

const PARAMETRO = 'RM036';
const CIUDAD = 'RM037';
const BLOQUEO = 'RM030';
const PREMIO_GANADO = 'RM038';
const CATALOGO = 'RM039';

// La administración cambia un parámetro como lo hace la API: el cambio y su constancia en la misma operación
async function cambiarParametro(clave: string, nuevo: string, constancia = true, motivo = 'Ajuste de prueba') {
  const cliente = await admin.connect();
  try {
    await cliente.query('BEGIN');
    const anterior = (await cliente.query('SELECT valor FROM parametro WHERE clave = $1', [clave])).rows[0]
      .valor as string;
    await cliente.query('UPDATE parametro SET valor = $2, actualizado_en = now() WHERE clave = $1', [clave, nuevo]);
    if (constancia) {
      await cliente.query(
        'INSERT INTO parametro_historial (clave, valor_anterior, valor_nuevo, motivo, admin_id) VALUES ($1, $2, $3, $4, $5)',
        [clave, anterior, nuevo, motivo, await administrador()],
      );
    }
    await cliente.query('COMMIT');
    return anterior;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// Ejecuta sentencias de administración y deja una constancia de auditoría en la misma operación
async function comoAdmin(
  accion: { tipo: string; accion: string; entidadId: string; motivo?: string } | null,
  sentencias: Array<[string, unknown[]?]>,
) {
  const cliente = await admin.connect();
  try {
    await cliente.query('BEGIN');
    if (accion) {
      await cliente.query(
        "INSERT INTO auditoria (admin_id, tipo, accion, entidad, entidad_id, motivo) VALUES ($1, $2::auditoria_tipo, $3, 'x', $4, $5)",
        [await administrador(), accion.tipo, accion.accion, accion.entidadId, accion.motivo ?? 'Motivo de la prueba'],
      );
    }
    for (const [sql, valores] of sentencias) await cliente.query(sql, valores);
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function limpiarPruebas() {
  await propietario.query("UPDATE premio SET activo = false WHERE activo AND nombre LIKE 'Prueba 12B%'");
  await propietario.query(
    "DELETE FROM lista_espera_ciudad WHERE ciudad_id IN (SELECT id FROM ciudad WHERE nombre LIKE 'Ciudad de %prueba%')",
  );
  await propietario.query(
    "DELETE FROM zona WHERE ciudad_id IN (SELECT id FROM ciudad WHERE nombre LIKE 'Ciudad de %prueba%')",
  );
  await propietario.query("DELETE FROM ciudad WHERE nombre LIKE 'Ciudad de %prueba%'");
}

describe('Parámetros, ciudades y premios en la base de datos (Fase 12B)', () => {
  beforeAll(async () => {
    await propietario.query("UPDATE premio SET activo = false WHERE activo AND nombre LIKE 'Premio de prueba%'");
  });
  afterAll(async () => {
    await limpiarPruebas();
    await cerrarConexiones();
  });

  describe('parámetros', () => {
    it('los rangos de la base son los mismos que valida el servidor', async () => {
      const reglas = (
        await propietario.query(
          'SELECT clave, minimo::int AS minimo, maximo::int AS maximo, costo_premios FROM parametro_regla',
        )
      ).rows as Array<{
        clave: string;
        minimo: number;
        maximo: number;
        costo_premios: boolean;
      }>;
      for (const r of PARAMETROS_EDITABLES) {
        expect(reglas.find((x) => x.clave === r.clave)).toMatchObject({
          minimo: r.minimo,
          maximo: r.maximo,
          costo_premios: r.costoPremios ?? false,
        });
      }
      expect(reglas).toHaveLength(PARAMETROS_EDITABLES.length + 1);
    });

    it('un valor dentro del rango, con su motivo en la misma operación, se aplica', async () => {
      const anterior = await cambiarParametro('aviso_max_activos', '4');
      expect(
        (await propietario.query("SELECT valor FROM parametro WHERE clave = 'aviso_max_activos'")).rows[0].valor,
      ).toBe('4');
      await cambiarParametro('aviso_max_activos', anterior);
    });

    it('fuera de su rango, sin motivo o sin ser editable, la base lo rechaza', async () => {
      await expect(cambiarParametro('aviso_max_activos', '11')).rejects.toMatchObject({ code: PARAMETRO });
      await expect(cambiarParametro('aviso_max_activos', '0')).rejects.toMatchObject({ code: PARAMETRO });
      await expect(cambiarParametro('aviso_max_activos', 'muchos')).rejects.toMatchObject({ code: PARAMETRO });
      await expect(cambiarParametro('aviso_max_activos', '5', false)).rejects.toMatchObject({ code: PARAMETRO });
      // El rango de precio por kg y los puntos por kg son reglas del producto
      await expect(cambiarParametro('precio_kg_maximo', '60')).rejects.toMatchObject({ code: PARAMETRO });
      await expect(cambiarParametro('precio_kg_minimo', '0.05')).rejects.toMatchObject({ code: PARAMETRO });
      await expect(cambiarParametro('puntos_por_kg', '2')).rejects.toMatchObject({ code: PARAMETRO });
      expect(
        (await propietario.query("SELECT valor FROM parametro WHERE clave = 'aviso_max_activos'")).rows[0].valor,
      ).toBe('3');
    });

    it('la API no escribe parámetros y la administración no crea ni borra ni edita su descripción', async () => {
      expect(await codigoDeError(api.query("UPDATE parametro SET valor = '9' WHERE clave = 'aviso_max_activos'"))).toBe(
        PERMISO_DENEGADO,
      );
      for (const sql of [
        "INSERT INTO parametro (clave, valor, descripcion) VALUES ('nuevo_parametro', '1', 'x')",
        "DELETE FROM parametro WHERE clave = 'aviso_max_activos'",
        "UPDATE parametro SET descripcion = 'otra' WHERE clave = 'aviso_max_activos'",
      ]) {
        expect(await codigoDeError(admin.query(sql))).toBe(PERMISO_DENEGADO);
      }
    });

    it('el historial de parámetros solo se agrega y se lee', async () => {
      await cambiarParametro('aviso_vigencia_max_dias', '15');
      await cambiarParametro('aviso_vigencia_max_dias', '14');
      for (const conexion of [api, admin]) {
        expect(await codigoDeError(conexion.query("UPDATE parametro_historial SET motivo = 'otro motivo'"))).toBe(
          PERMISO_DENEGADO,
        );
        expect(await codigoDeError(conexion.query('DELETE FROM parametro_historial'))).toBe(PERMISO_DENEGADO);
      }
      expect(await codigoDeError(propietario.query("UPDATE parametro_historial SET motivo = 'otro motivo'"))).toBe(
        BLOQUEO,
      );
      expect(await codigoDeError(propietario.query('DELETE FROM parametro_historial'))).toBe(BLOQUEO);
      expect(
        await codigoDeError(
          propietario.query(
            "INSERT INTO parametro_historial (clave, valor_anterior, valor_nuevo, motivo, admin_id) VALUES ('x', '1', '2', 'no', (SELECT id FROM usuario WHERE rol = 'ADMIN' LIMIT 1))",
          ),
        ),
      ).toBe(RESTRICCION);
    });
  });

  describe('ciudades', () => {
    async function ciudadNueva() {
      const r = await propietario.query(
        "INSERT INTO ciudad (nombre, region, estado) VALUES ($1, 'Región de prueba', 'PROXIMAMENTE') RETURNING id",
        [`Ciudad de prueba ${Math.random().toString(36).slice(2, 8)}`],
      );
      return r.rows[0].id as number;
    }

    it('se activa solo con zonas, verificadores, precios base y su motivo en la auditoría', async () => {
      const id = await ciudadNueva();
      const activar = (constancia = true) =>
        comoAdmin(constancia ? { tipo: 'CIUDADES', accion: 'ACTIVAR', entidadId: String(id) } : null, [
          ["UPDATE ciudad SET estado = 'ACTIVA' WHERE id = $1", [id]],
        ]);
      await expect(activar()).rejects.toMatchObject({ code: CIUDAD });
      await propietario.query(
        "INSERT INTO zona (ciudad_id, nombre, centro) VALUES ($1, 'Centro', ST_SetSRID(ST_MakePoint(-71.5, -16.4), 4326)::geography)",
        [id],
      );
      await expect(activar()).rejects.toMatchObject({ code: CIUDAD });
      await propietario.query('UPDATE ciudad SET verificadores_asignados = true WHERE id = $1', [id]);
      await expect(activar()).rejects.toMatchObject({ code: CIUDAD });
      await propietario.query('UPDATE ciudad SET precios_base_cargados = true WHERE id = $1', [id]);
      await expect(activar(false)).rejects.toMatchObject({ code: CIUDAD });
      await activar();
      expect((await propietario.query('SELECT estado FROM ciudad WHERE id = $1', [id])).rows[0].estado).toBe('ACTIVA');
    });

    it('la API no cambia ciudades ni zonas', async () => {
      const id = await ciudadNueva();
      expect(await codigoDeError(api.query("UPDATE ciudad SET estado = 'ACTIVA' WHERE id = $1", [id]))).toBe(
        PERMISO_DENEGADO,
      );
      expect(
        await codigoDeError(
          api.query(
            "INSERT INTO zona (ciudad_id, nombre, centro) VALUES ($1, 'X', ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography)",
            [id],
          ),
        ),
      ).toBe(PERMISO_DENEGADO);
    });
  });

  describe('premios', () => {
    const premio = async (
      nombre: string,
      tipo: 'PUNTOS' | 'OBJETO' | 'SIN_PREMIO',
      probabilidad = 0,
      activo = false,
    ) => {
      const r = await propietario.query(
        `INSERT INTO premio (nombre, tipo, puntos, probabilidad, stock, punto_entrega, vigencia_canje_dias, activo, orden)
         VALUES ($1, $2::premio_tipo, $3, $4, $5, $6, $7, $8, 98) RETURNING id`,
        [
          `Prueba 12B ${nombre} ${Math.random().toString(36).slice(2, 7)}`,
          tipo,
          tipo === 'PUNTOS' ? 10 : null,
          probabilidad,
          tipo === 'SIN_PREMIO' ? null : 5,
          tipo === 'OBJETO' ? 'Punto de prueba' : null,
          tipo === 'OBJETO' ? 30 : null,
          activo,
        ],
      );
      return r.rows[0].id as string;
    };

    it('un premio que ya salió no se borra ni cambia de nombre, tipo o puntos', async () => {
      const id = await premio('Premio ganado', 'PUNTOS', 0, true);
      const reciclador = await crearReciclador();
      const giro = await giroGastado(reciclador);
      const configuracion = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0]
        .id as number;
      await propietario.query(
        'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4)',
        [giro, reciclador, configuracion, id],
      );
      for (const sql of [
        "UPDATE premio SET nombre = 'Otro nombre' WHERE id = $1",
        'UPDATE premio SET puntos = 99 WHERE id = $1',
        "UPDATE premio SET tipo = 'SIN_PREMIO', puntos = NULL WHERE id = $1",
      ]) {
        expect(await codigoDeError(propietario.query(sql, [id]))).toBe(PREMIO_GANADO);
      }
      expect(await codigoDeError(admin.query('DELETE FROM premio WHERE id = $1', [id]))).toBe(PERMISO_DENEGADO);
      expect(await codigoDeError(propietario.query('DELETE FROM premio WHERE id = $1', [id]))).toBe('23503');
      expect(
        await codigoDeError(propietario.query('UPDATE premio SET stock = stock + 1 WHERE id = $1', [id])),
      ).toBeUndefined();
    });

    it('la administración no crea un tipo de premio fuera de los tres permitidos', async () => {
      expect(
        await codigoDeError(
          propietario.query(
            "INSERT INTO premio (nombre, tipo, probabilidad, orden) VALUES ('Dinero', 'EFECTIVO', 0, 1)",
          ),
        ),
      ).toBe('22P02');
    });

    it('el catálogo de la administración suma exactamente 100 % y deja su constancia; sin eso no se guarda', async () => {
      const sin = await propietario.query(
        "SELECT id, probabilidad::float8 AS p FROM premio WHERE activo AND tipo = 'SIN_PREMIO' LIMIT 1",
      );
      const sinId = sin.rows[0].id as string;
      const p = sin.rows[0].p as number;
      const cambio = (valor: number, constancia = true) =>
        comoAdmin(constancia ? { tipo: 'PREMIOS', accion: 'CATALOGO', entidadId: 'catalogo' } : null, [
          ['UPDATE premio SET probabilidad = $2 WHERE id = $1', [sinId, valor]],
        ]);
      await expect(cambio(p + 1)).rejects.toMatchObject({ code: CATALOGO });
      await expect(cambio(p, false)).rejects.toMatchObject({ code: CATALOGO });
      expect(
        Number(
          (await propietario.query('SELECT probabilidad FROM premio WHERE id = $1', [sinId])).rows[0].probabilidad,
        ),
      ).toBe(p);
    });

    it('reponer stock exige su constancia y nunca deja stock negativo', async () => {
      const id = await premio('Premio con stock', 'OBJETO', 0, false);
      expect(await codigoDeError(admin.query('UPDATE premio SET stock = stock + 5 WHERE id = $1', [id]))).toBe(
        CATALOGO,
      );
      await comoAdmin({ tipo: 'PREMIOS', accion: 'STOCK', entidadId: id }, [
        ['UPDATE premio SET stock = stock + 5 WHERE id = $1', [id]],
      ]);
      expect(Number((await propietario.query('SELECT stock FROM premio WHERE id = $1', [id])).rows[0].stock)).toBe(10);
      expect(await codigoDeError(propietario.query('UPDATE premio SET stock = -1 WHERE id = $1', [id]))).toBe(
        RESTRICCION,
      );
    });

    it('la API no puede cambiar premios y la administración no escribe sorteos ni giros por la ruleta', async () => {
      const id = await premio('Premio de la API', 'OBJETO');
      expect(await codigoDeError(api.query('UPDATE premio SET stock = 99 WHERE id = $1', [id]))).toBe(PERMISO_DENEGADO);
      expect(
        await codigoDeError(
          admin.query(
            'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES (gen_random_uuid(), gen_random_uuid(), 1, 1, gen_random_uuid())',
          ),
        ),
      ).toBe(PERMISO_DENEGADO);
    });

    it('un premio solo se marca como entregado con la constancia de auditoría de la administración', async () => {
      const id = await premio('Premio a entregar', 'OBJETO', 0, true);
      const reciclador = await crearReciclador();
      const giro = await giroGastado(reciclador);
      const configuracion = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0]
        .id as number;
      const sorteo = (
        await propietario.query(
          'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
          [giro, reciclador, configuracion, id],
        )
      ).rows[0].id as string;
      const ganado = (
        await api.query(
          `INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, $4, 'Punto', now() + interval '30 days') RETURNING id`,
          [sorteo, reciclador, id, `RM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`],
        )
      ).rows[0].id as string;
      await api.query("UPDATE premio_ganado SET estado = 'RECLAMADO' WHERE id = $1", [ganado]);
      expect(
        await codigoDeError(api.query("UPDATE premio_ganado SET estado = 'ENTREGADO' WHERE id = $1", [ganado])),
      ).toBe('RM032');
      await expect(
        comoAdmin(null, [["UPDATE premio_ganado SET estado = 'ENTREGADO' WHERE id = $1", [ganado]]]),
      ).rejects.toMatchObject({ code: CATALOGO });
      await comoAdmin({ tipo: 'PREMIOS', accion: 'ENTREGAR', entidadId: ganado }, [
        ["UPDATE premio_ganado SET estado = 'ENTREGADO' WHERE id = $1", [ganado]],
      ]);
      expect((await propietario.query('SELECT estado FROM premio_ganado WHERE id = $1', [ganado])).rows[0].estado).toBe(
        'ENTREGADO',
      );
    });
  });
});
