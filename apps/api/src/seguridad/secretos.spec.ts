import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { raizDelProyecto } from '../nucleo/configuracion/entorno.js';
import { buscarSecretos } from './buscar-secretos.js';

describe('búsqueda de secretos', () => {
  it('detecta una clave real en una carpeta de prueba', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'secretos-'));
    try {
      writeFileSync(path.join(carpeta, 'a.ts'), "const k = 'AIzaSyA1234567890abcdefghijklmnopqrstuv';\n");
      writeFileSync(path.join(carpeta, 'b.env'), 'CLAVE=-----BEGIN PRIVATE KEY-----\n');
      const tipos = buscarSecretos(carpeta).map((h) => h.tipo);
      expect(tipos).toEqual(expect.arrayContaining(['Clave de API de Google', 'Clave privada']));
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('el repositorio no contiene claves ni tokens reales', () => {
    expect(buscarSecretos(raizDelProyecto())).toEqual([]);
  });
});
