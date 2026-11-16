import { Client } from 'pg';
import { nombreBd, urlBd } from '../src/nucleo/base-datos/conexiones.js';

const USUARIOS = [
  { nombre: 'rm_api', variable: 'DB_API_CLAVE' },
  { nombre: 'rm_admin', variable: 'DB_ADMIN_CLAVE' },
] as const;

async function prepararBaseDatos(): Promise<void> {
  const cliente = new Client({ connectionString: urlBd('propietario') });
  await cliente.connect();
  try {
    const pruebas = nombreBd(true);
    const existe = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [pruebas]);
    if (existe.rowCount === 0) {
      await cliente.query(`CREATE DATABASE "${pruebas}"`);
      console.log(`Base de datos de pruebas creada: ${pruebas}`);
    }

    for (const { nombre, variable } of USUARIOS) {
      const clave = process.env[variable];
      if (!clave) {
        throw new Error(`Falta la variable ${variable} en el archivo .env`);
      }
      const rol = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [nombre]);
      if (rol.rowCount === 0) {
        await cliente.query(`CREATE ROLE ${nombre} NOLOGIN`);
      }
      const sentencia = await cliente.query<{ sql: string }>(
        "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql",
        [nombre, clave],
      );
      await cliente.query(sentencia.rows[0]!.sql);
      console.log(`Usuario de base de datos listo: ${nombre}`);
    }
  } finally {
    await cliente.end();
  }
}

prepararBaseDatos().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
