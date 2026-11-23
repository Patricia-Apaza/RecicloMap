import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { exigirEntornoDeSemilla } from '../prisma/entorno-semilla.js';
import { nombreBd, urlBd } from '../src/nucleo/base-datos/conexiones.js';

// Solo para las pruebas de navegador: deja una cuenta de prueba en una situación que la interfaz no puede provocar sola
exigirEntornoDeSemilla();
const [accion, telefono] = process.argv.slice(2);
if (!telefono || !/^9\d{8}$/.test(telefono)) throw new Error('Indica el teléfono de la cuenta de prueba.');
const pool = new Pool({
  connectionString: urlBd('propietario', nombreBd(process.env.RM_BD_OBJETIVO === 'pruebas')),
  max: 1,
});

async function uno<T>(sql: string, valores: unknown[] = []): Promise<T> {
  const fila = (await pool.query(sql, valores)).rows[0] as T | undefined;
  if (!fila) throw new Error('No encontré lo que la preparación necesita.');
  return fila;
}

try {
  const { id: usuario } = await uno<{ id: string }>('SELECT id FROM usuario WHERE telefono = $1', [telefono]);

  if (accion === 'textos-antiguos') {
    // Textos legales de una versión anterior: debe aceptarlos de nuevo
    await pool.query(
      "UPDATE consentimiento SET version = '2026-01' WHERE tipo IN ('TERMINOS', 'PRIVACIDAD') AND usuario_id = $1",
      [usuario],
    );
  } else if (accion === 'premio-por-reclamar') {
    // Un premio de objeto ya ganado, por reclamar
    const premio = await uno<{ id: string }>("SELECT id FROM premio WHERE tipo = 'OBJETO' AND activo LIMIT 1");
    // Un giro de prueba sin reunir los puntos que lo dan: se inserta sin las reglas, solo en esta preparación
    const cliente = await pool.connect();
    let giro: { id: string };
    try {
      await cliente.query('BEGIN');
      await cliente.query('SET LOCAL session_replication_role = replica');
      giro = (
        await cliente.query<{ id: string }>(
          "INSERT INTO giro (usuario_id, origen, numero, usado_en) VALUES ($1, 'PUNTOS', 1, now()) RETURNING id",
          [usuario],
        )
      ).rows[0]!;
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
    const config = await uno<{ id: number }>('SELECT max(id) AS id FROM ruleta_configuracion');
    const sorteo = await uno<{ id: string }>(
      'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
      [giro.id, usuario, config.id, premio.id],
    );
    await pool.query(
      "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, $4, 'Punto de prueba', now() + interval '20 days')",
      [sorteo.id, usuario, premio.id, `RM-${randomBytes(2).toString('hex').toUpperCase()}`],
    );
  } else {
    throw new Error('Acción desconocida.');
  }
} finally {
  await pool.end();
}
