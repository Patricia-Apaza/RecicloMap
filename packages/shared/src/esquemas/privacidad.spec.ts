import { describe, expect, it } from 'vitest';
import { esquemaRegistroNegocio, esquemaRegistroReciclador } from './acceso.js';
import {
  BLOQUEOS_ELIMINACION,
  esquemaAceptarTextos,
  esquemaEliminarCuenta,
  esquemaExportarDatos,
  RETENCION_DIAS,
  TEXTO_BLOQUEO,
  VERSION_TEXTOS_LEGALES,
} from './privacidad.js';

const base = { nombre: 'Rosa Mamani', telefono: '951234567', contrasena: 'clave-segura-1', aceptaTerminos: true };

describe('Consentimientos y privacidad', () => {
  it('el registro exige declarar ser mayor de 18 años además de aceptar los textos', () => {
    expect(esquemaRegistroReciclador.safeParse(base).success).toBe(false);
    expect(esquemaRegistroReciclador.safeParse({ ...base, mayorDeEdad: false }).success).toBe(false);
    expect(esquemaRegistroReciclador.safeParse({ ...base, mayorDeEdad: true }).success).toBe(true);
    const negocio = { tipo: 'CENTRO', telefono: '951234567', contrasena: 'clave-segura-1', aceptaTerminos: true };
    expect(esquemaRegistroNegocio.safeParse(negocio).success).toBe(false);
    expect(esquemaRegistroNegocio.safeParse({ ...negocio, mayorDeEdad: true }).success).toBe(true);
  });

  it('solo se acepta la versión vigente de los textos', () => {
    expect(esquemaAceptarTextos.safeParse({ version: VERSION_TEXTOS_LEGALES, aceptaTerminos: true }).success).toBe(
      true,
    );
    expect(esquemaAceptarTextos.safeParse({ version: '2026-01', aceptaTerminos: true }).success).toBe(false);
    expect(esquemaAceptarTextos.safeParse({ version: VERSION_TEXTOS_LEGALES }).success).toBe(false);
  });

  it('exportar y eliminar piden la contraseña; eliminar también el código y la confirmación', () => {
    // La contraseña o el código se exigen según la cuenta (las de Google no tienen contraseña): lo decide el servidor
    expect(esquemaExportarDatos.safeParse({ contrasena: 'x' }).success).toBe(true);
    expect(esquemaExportarDatos.safeParse({ codigo: '123456' }).success).toBe(true);
    expect(esquemaExportarDatos.safeParse({ codigo: '12' }).success).toBe(false);
    expect(esquemaEliminarCuenta.safeParse({ contrasena: 'x', codigo: '123456' }).success).toBe(false);
    expect(esquemaEliminarCuenta.safeParse({ codigo: '123456', entiendo: true }).success).toBe(true);
    expect(esquemaEliminarCuenta.safeParse({ contrasena: 'x', codigo: '12', entiendo: true }).success).toBe(false);
    expect(esquemaEliminarCuenta.safeParse({ contrasena: 'x', codigo: '123456', entiendo: true }).success).toBe(true);
  });

  it('cada bloqueo de la eliminación dice qué resolver y dónde', () => {
    for (const tipo of BLOQUEOS_ELIMINACION) {
      expect(TEXTO_BLOQUEO[tipo].que.length).toBeGreaterThan(10);
      expect(TEXTO_BLOQUEO[tipo].donde).toMatch(/^\//);
    }
  });

  it('los plazos de retención son positivos', () => {
    for (const dias of Object.values(RETENCION_DIAS)) expect(dias).toBeGreaterThan(0);
  });
});
