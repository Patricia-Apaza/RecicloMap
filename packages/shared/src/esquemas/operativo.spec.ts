import { describe, expect, it } from 'vitest';
import { BANNER_MAXIMO, esquemaBanner, esquemaMantenimiento, esquemaRegistroAbierto } from './operativo.js';

const en = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();
const motivo = 'Ajuste acordado con el equipo';

describe('Controles operativos', () => {
  it('el aviso global admite hasta 140 caracteres, exige sus fechas y su motivo', () => {
    expect(esquemaBanner.safeParse({ texto: 'Hola', desde: en(-1), hasta: en(2), motivo }).success).toBe(true);
    expect(
      esquemaBanner.safeParse({ texto: 'x'.repeat(BANNER_MAXIMO + 1), desde: en(-1), hasta: en(2), motivo }).success,
    ).toBe(false);
    expect(esquemaBanner.safeParse({ texto: 'Hola', motivo }).success).toBe(false);
    expect(esquemaBanner.safeParse({ texto: 'Hola', desde: en(2), hasta: en(1), motivo }).success).toBe(false);
    expect(esquemaBanner.safeParse({ texto: 'Hola', desde: en(-3), hasta: en(-2), motivo }).success).toBe(false);
    expect(esquemaBanner.safeParse({ texto: 'Hola', desde: en(-1), hasta: en(2), motivo: 'no' }).success).toBe(false);
    expect(esquemaBanner.safeParse({ texto: null, motivo }).success).toBe(true);
  });

  it('el registro se abre o se cierra por rol y siempre con motivo', () => {
    expect(esquemaRegistroAbierto.safeParse({ reciclador: false, motivo }).success).toBe(true);
    expect(esquemaRegistroAbierto.safeParse({ negocio: true, motivo }).success).toBe(true);
    expect(esquemaRegistroAbierto.safeParse({ motivo }).success).toBe(false);
    expect(esquemaRegistroAbierto.safeParse({ reciclador: false }).success).toBe(false);
  });

  it('activar el mantenimiento exige mensaje y confirmación; apagarlo, solo confirmación', () => {
    expect(
      esquemaMantenimiento.safeParse({ activo: true, mensaje: 'Volvemos pronto.', motivo, confirmar: true }).success,
    ).toBe(true);
    expect(esquemaMantenimiento.safeParse({ activo: true, motivo, confirmar: true }).success).toBe(false);
    expect(esquemaMantenimiento.safeParse({ activo: true, mensaje: 'Volvemos pronto.', motivo }).success).toBe(false);
    expect(esquemaMantenimiento.safeParse({ activo: false, motivo, confirmar: true }).success).toBe(true);
  });
});
