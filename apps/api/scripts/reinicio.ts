import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { nombreBd, urlBd } from '../src/nucleo/base-datos/conexiones.js';

export async function reiniciarBaseDatos(pruebas: boolean, sembrar = true): Promise<void> {
  const baseDatos = nombreBd(pruebas);
  const cliente = new Client({ connectionString: urlBd('propietario', baseDatos) });
  await cliente.connect();
  try {
    await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
    await cliente.query('CREATE SCHEMA public');
  } finally {
    await cliente.end();
  }

  const opciones = {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'inherit' as const,
    env: { ...process.env, RM_BD_OBJETIVO: pruebas ? 'pruebas' : 'desarrollo' },
  };
  execSync('pnpm exec prisma migrate deploy', opciones);
  if (sembrar) {
    execSync('pnpm exec prisma generate', opciones);
    execSync('pnpm exec prisma db seed', opciones);
  }
}
