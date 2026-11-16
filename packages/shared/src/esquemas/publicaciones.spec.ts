import { describe, expect, it } from 'vitest';
import { esquemaEstadoMovil, esquemaNuevaPublicacion, esquemaOferta } from './publicaciones.js';

const mensajes = (resultado: { error?: { issues: Array<{ message: string }> } }) =>
  resultado.error?.issues.map((problema) => problema.message) ?? [];

describe('Publicación (12)', () => {
  it('exige material y kilos entre 1 y 5 000; acepta coma decimal', () => {
    expect(mensajes(esquemaNuevaPublicacion.safeParse({ kg: '' }))).toEqual(
      expect.arrayContaining(['Elige un material.']),
    );
    expect(mensajes(esquemaNuevaPublicacion.safeParse({ material: 'pet', kg: 0 }))).toContain(
      'Escribe un peso entre 1 y 5 000 kg.',
    );
    expect(mensajes(esquemaNuevaPublicacion.safeParse({ material: 'pet', kg: 5001 }))).toContain(
      'Escribe un peso entre 1 y 5 000 kg.',
    );
    const valida = esquemaNuevaPublicacion.parse({ material: 'pet', kg: '35,5', precioEsperado: '2,60' });
    expect(valida).toMatchObject({ kg: 35.5, precioEsperado: 2.6, fotos: [] });
  });

  it('el precio esperado es opcional pero, si va, está entre S/ 0.10 y S/ 50.00', () => {
    expect(esquemaNuevaPublicacion.safeParse({ material: 'pet', kg: 10, precioEsperado: '' }).success).toBe(true);
    expect(mensajes(esquemaNuevaPublicacion.safeParse({ material: 'pet', kg: 10, precioEsperado: 50.01 }))).toContain(
      'Escribe un precio entre S/ 0.10 y S/ 50.00 por kg.',
    );
  });

  it('admite hasta 3 fotos y una nota de 140 caracteres', () => {
    const foto = '0b9c6a52-8f4e-4c1a-9d2b-1a2b3c4d5e6f';
    expect(
      esquemaNuevaPublicacion.safeParse({ material: 'pet', kg: 10, fotos: [foto, foto, foto, foto] }).success,
    ).toBe(false);
    expect(esquemaNuevaPublicacion.safeParse({ material: 'pet', kg: 10, nota: 'x'.repeat(141) }).success).toBe(false);
  });
});

describe('Oferta (44)', () => {
  it('precio por kg dentro de los límites y cuándo recoge de la lista', () => {
    expect(esquemaOferta.safeParse({ precioKg: 0.05 }).success).toBe(false);
    expect(esquemaOferta.safeParse({ precioKg: '2,7', cuandoRecoge: 'Hoy por la tarde' }).success).toBe(true);
    expect(esquemaOferta.safeParse({ precioKg: 2.7, cuandoRecoge: 'Cuando sea' }).success).toBe(false);
  });
});

describe('Estado del comprador móvil (52)', () => {
  it('pide al menos un cambio', () => {
    expect(esquemaEstadoMovil.safeParse({}).success).toBe(false);
    expect(esquemaEstadoMovil.safeParse({ disponibilidad: 'EN_RUTA' }).success).toBe(true);
  });
});
