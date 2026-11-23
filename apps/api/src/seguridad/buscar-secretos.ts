import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type Hallazgo = { archivo: string; linea: number; tipo: string };

// Formas de claves reales; los valores de ejemplo (.env.example) y las claves de pruebas no coinciden
const PATRONES: Array<{ tipo: string; patron: RegExp }> = [
  { tipo: 'Clave privada', patron: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { tipo: 'Clave de acceso de AWS', patron: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { tipo: 'Clave de API de Google', patron: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { tipo: 'Token de GitHub', patron: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { tipo: 'Token de Slack', patron: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  { tipo: 'Token de acceso en claro', patron: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { tipo: 'Secreto del cliente de Google', patron: /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/ },
];
const IGNORAR = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  '.turbo',
  'coverage',
  'playwright-report',
  'playwright-report-flujos',
  'test-results',
  'generado',
]);
const EXTENSIONES = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|env|sql|html|css|sh|txt)$/i;

export function buscarSecretos(raiz: string, maximoBytes = 1_000_000): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const recorrer = (carpeta: string) => {
    for (const nombre of readdirSync(carpeta)) {
      if (
        IGNORAR.has(nombre) ||
        (nombre.startsWith('.') && statSync(path.join(carpeta, nombre)).isDirectory() && nombre !== '.github')
      )
        continue;
      const ruta = path.join(carpeta, nombre);
      const info = statSync(ruta);
      if (info.isDirectory()) recorrer(ruta);
      else if (
        (EXTENSIONES.test(nombre) || nombre.startsWith('.env')) &&
        info.size <= maximoBytes &&
        !nombre.endsWith('.spec.ts')
      ) {
        const lineas = readFileSync(ruta, 'utf8').split('\n');
        lineas.forEach((linea, indice) => {
          for (const { tipo, patron } of PATRONES)
            if (patron.test(linea)) hallazgos.push({ archivo: path.relative(raiz, ruta), linea: indice + 1, tipo });
        });
      }
    }
  };
  recorrer(raiz);
  return hallazgos;
}
