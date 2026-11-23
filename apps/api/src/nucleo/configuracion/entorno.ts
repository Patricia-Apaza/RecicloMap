import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

export function raizDelProyecto(): string {
  let carpeta = import.meta.dirname;
  for (let nivel = 0; nivel < 8; nivel++) {
    if (existsSync(path.join(carpeta, 'pnpm-workspace.yaml'))) {
      return carpeta;
    }
    carpeta = path.dirname(carpeta);
  }
  return process.cwd();
}

// Las variables ya definidas en el sistema tienen prioridad sobre el archivo .env
config({ path: path.join(raizDelProyecto(), '.env'), quiet: true });
