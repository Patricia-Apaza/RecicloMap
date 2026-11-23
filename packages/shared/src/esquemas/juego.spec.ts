import { describe, expect, it } from 'vitest';
import { esquemaConfirmarEntrega, esquemaEntregaDirecta, esquemaRanking, esquemaRechazarEntrega } from './juego.js';

const negocio = '7d3c2b1a-0000-4000-8000-000000000001';

describe('entrega directa', () => {
  it('acepta material, kilos con coma y una fecha', () => {
    const lectura = esquemaEntregaDirecta.safeParse({
      compradorId: negocio,
      material: 'carton',
      kg: '12,5',
      fecha: '2026-11-16',
    });
    expect(lectura.success).toBe(true);
    expect(lectura.data?.kg).toBe(12.5);
  });

  it('rechaza kilos fuera de 1 a 5 000, materiales desconocidos y negocios que no son un identificador', () => {
    expect(esquemaEntregaDirecta.safeParse({ compradorId: negocio, material: 'carton', kg: 0 }).success).toBe(false);
    expect(esquemaEntregaDirecta.safeParse({ compradorId: negocio, material: 'carton', kg: 5001 }).success).toBe(false);
    expect(esquemaEntregaDirecta.safeParse({ compradorId: negocio, material: 'oro', kg: 5 }).success).toBe(false);
    expect(esquemaEntregaDirecta.safeParse({ compradorId: 'x', material: 'pet', kg: 5 }).success).toBe(false);
  });

  it('la confirmación pide kilos y el rechazo un motivo', () => {
    expect(esquemaConfirmarEntrega.safeParse({ kg: '7' }).success).toBe(true);
    expect(esquemaConfirmarEntrega.safeParse({}).success).toBe(false);
    expect(esquemaRechazarEntrega.safeParse({ motivo: 'no' }).success).toBe(false);
    expect(esquemaRechazarEntrega.safeParse({ motivo: 'No recibí ese material.' }).success).toBe(true);
  });
});

describe('ranking', () => {
  it('el alcance por defecto es el mes y solo admite mes o acumulado', () => {
    expect(esquemaRanking.parse({}).alcance).toBe('mes');
    expect(esquemaRanking.safeParse({ alcance: 'siempre' }).success).toBe(false);
    expect(esquemaRanking.safeParse({ ciudad: '99999' }).success).toBe(false);
  });
});
