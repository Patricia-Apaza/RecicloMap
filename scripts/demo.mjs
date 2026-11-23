// Modo demostración: arranca la aplicación compilada en esta computadora para exponerla con un túnel.
// Lee .env y encima .env.demo (que solo existe para la demostración). Uso: node scripts/demo.mjs <verificar|preparar|iniciar>
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ORDEN = process.argv[2];
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function leerEnv(archivo) {
  const valores = {};
  if (!existsSync(archivo)) return valores;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m || linea.trim().startsWith('#')) continue;
    valores[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return valores;
}

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

if (!existsSync(path.join(RAIZ, '.env'))) fallar('Falta el archivo .env. Cópialo de .env.example (README, paso 1).');
if (!existsSync(path.join(RAIZ, '.env.demo'))) {
  fallar('Falta el archivo .env.demo. Cópialo de .env.demo.example y completa la dirección pública y las contraseñas.');
}
const entorno = {
  ...process.env,
  ...leerEnv(path.join(RAIZ, '.env')),
  ...leerEnv(path.join(RAIZ, '.env.demo')),
  ...process.env,
};
// Lo del sistema manda, pero la demostración siempre se declara en .env.demo
Object.assign(entorno, leerEnv(path.join(RAIZ, '.env.demo')));
if (entorno.MODO_DEMOSTRACION !== 'true')
  fallar('.env.demo debe tener MODO_DEMOSTRACION=true (es lo que activa la demostración).');
if (!existsSync(path.join(RAIZ, 'apps/api/dist/main.js')) || !existsSync(path.join(RAIZ, 'apps/web/.next'))) {
  fallar('La aplicación no está compilada. Ejecuta primero: pnpm build');
}

// Valida la configuración con las mismas reglas con que arrancará la API; si algo falta, dice qué
function verificar() {
  const r = spawnSync(
    process.execPath,
    ['-e', "import('./apps/api/dist/nucleo/configuracion/configuracion.js').then((m) => { new m.Configuracion(); })"],
    { cwd: RAIZ, env: entorno, encoding: 'utf8' },
  );
  if (r.status !== 0) {
    const detalle = `${r.stderr}`.split('\n').find((l) => /Error:/.test(l)) ?? r.stderr;
    fallar(detalle.replace(/^.*Error:\s*/, ''));
  }
  console.log('✔ Configuración de la demostración válida');
}

function correr(argumentos, extra = {}) {
  return spawnSync(PNPM, argumentos, {
    cwd: RAIZ,
    env: { ...entorno, ...extra },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

if (ORDEN === 'verificar') {
  verificar();
} else if (ORDEN === 'preparar') {
  verificar();
  console.log('Reiniciando la base de datos con los datos de la semilla (borra lo que haya)…');
  const r = correr(['--filter', '@reciclomap/api', 'db:reiniciar']);
  if (r.status !== 0)
    fallar(
      'No se pudo preparar la base de datos. Revisa que los servicios estén levantados (pnpm servicios:levantar).',
    );
  console.log('✔ Datos de demostración listos');
} else if (ORDEN === 'iniciar') {
  verificar();
  const puertoApi = entorno.API_PUERTO ?? '3001';
  const hijos = [
    spawn(process.execPath, ['dist/main.js'], { cwd: path.join(RAIZ, 'apps/api'), env: entorno, stdio: 'inherit' }),
    spawn(PNPM, ['exec', 'next', 'start', '--port', '3000'], {
      cwd: path.join(RAIZ, 'apps/web'),
      env: { ...entorno, API_URL_INTERNA: `http://localhost:${puertoApi}` },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }),
  ];
  const apagar = () => {
    for (const hijo of hijos) hijo.kill();
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
  for (const hijo of hijos) hijo.on('exit', (codigo) => codigo && apagar());
  console.log(
    `\nLa aplicación corre en http://localhost:3000. Ahora abre el túnel en otra terminal (docs/demostracion-con-tunel.md).`,
  );
  console.log('Para apagar todo: Ctrl + C.\n');
} else {
  fallar('Uso: node scripts/demo.mjs <verificar|preparar|iniciar>');
}
