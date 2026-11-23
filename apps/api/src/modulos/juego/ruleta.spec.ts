import { ESCALA_AZAR } from '@reciclomap/shared';
import {
  motivoSinSalida,
  type PremioDeRuleta,
  probabilidadesEfectivas,
  RuletaMalConfigurada,
  sortear,
  validarRuleta,
} from './ruleta.js';

const AHORA = new Date('2026-11-20T15:00:00Z');

const premio = (id: string, probabilidad: number, extra: Partial<PremioDeRuleta> = {}): PremioDeRuleta => ({
  id,
  nombre: id,
  tipo: 'OBJETO',
  probabilidad,
  stock: null,
  vigenteDesde: null,
  vigenteHasta: null,
  orden: 0,
  ...extra,
});

// Ocho segmentos como en el prototipo; las probabilidades suman 100 %
function ruleta(extra: Record<string, Partial<PremioDeRuleta>> = {}): PremioDeRuleta[] {
  const base: Array<[string, number, PremioDeRuleta['tipo']]> = [
    ['p20', 15, 'PUNTOS'],
    ['bolsas', 12, 'OBJETO'],
    ['p50', 5, 'PUNTOS'],
    ['gorra', 8, 'OBJETO'],
    ['nada', 20, 'SIN_PREMIO'],
    ['kit', 5, 'OBJETO'],
    ['p10', 25, 'PUNTOS'],
    ['botella', 10, 'OBJETO'],
  ];
  return base.map(([id, p, tipo], orden) => premio(id, p, { tipo, orden, ...(extra[id] ?? {}) }));
}

// Recorre los 10 000 números posibles: el reparto es exacto, sin azar de por medio
function frecuencias(premios: PremioDeRuleta[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (let n = 0; n < ESCALA_AZAR; n++) {
    const { entregado } = sortear(premios, n, AHORA);
    cuenta.set(entregado.id, (cuenta.get(entregado.id) ?? 0) + 1);
  }
  return cuenta;
}

describe('Sorteo de la ruleta', () => {
  it('cada premio sale con exactamente su probabilidad configurada', () => {
    const cuenta = frecuencias(ruleta());
    expect(cuenta.get('p20')).toBe(1500);
    expect(cuenta.get('bolsas')).toBe(1200);
    expect(cuenta.get('p50')).toBe(500);
    expect(cuenta.get('gorra')).toBe(800);
    expect(cuenta.get('nada')).toBe(2000);
    expect(cuenta.get('kit')).toBe(500);
    expect(cuenta.get('p10')).toBe(2500);
    expect(cuenta.get('botella')).toBe(1000);
  });

  it('los límites de cada tramo caen en el premio correcto', () => {
    const premios = ruleta();
    expect(sortear(premios, 0, AHORA).entregado.id).toBe('p20');
    expect(sortear(premios, 1499, AHORA).entregado.id).toBe('p20');
    expect(sortear(premios, 1500, AHORA).entregado.id).toBe('bolsas');
    expect(sortear(premios, 9999, AHORA).entregado.id).toBe('botella');
  });

  it('un premio sin stock no puede salir y su probabilidad pasa a "Sigue intentando" sin mover las demás', () => {
    const cuenta = frecuencias(ruleta({ gorra: { stock: 0 } }));
    expect(cuenta.get('gorra')).toBeUndefined();
    expect(cuenta.get('nada')).toBe(2800);
    for (const [id, esperado] of [
      ['p20', 1500],
      ['bolsas', 1200],
      ['p50', 500],
      ['kit', 500],
      ['p10', 2500],
      ['botella', 1000],
    ] as const) {
      expect(cuenta.get(id)).toBe(esperado);
    }
    const unico = sortear(ruleta({ gorra: { stock: 0 } }), 3500, AHORA);
    expect(unico.sorteado.id).toBe('gorra');
    expect(unico.entregado.id).toBe('nada');
    expect(unico.motivo).toBe('SIN_STOCK');
  });

  it('un premio fuera de su campaña tampoco sale', () => {
    const premios = ruleta({
      kit: { vigenteHasta: new Date('2026-11-01T00:00:00Z') },
      botella: { vigenteDesde: new Date('2026-12-01T00:00:00Z') },
    });
    expect(
      motivoSinSalida(
        premios.find((p) => p.id === 'kit')!,
        AHORA,
      ),
    ).toBe('FUERA_DE_CAMPANA');
    expect(
      motivoSinSalida(
        premios.find((p) => p.id === 'botella')!,
        AHORA,
      ),
    ).toBe('FUERA_DE_CAMPANA');
    const cuenta = frecuencias(premios);
    expect(cuenta.get('kit')).toBeUndefined();
    expect(cuenta.get('botella')).toBeUndefined();
    expect(cuenta.get('nada')).toBe(3500);
  });

  it('la campaña incluye su inicio y excluye su fin', () => {
    const premio = ruleta()[1]!;
    const campana = { ...premio, vigenteDesde: AHORA, vigenteHasta: new Date('2026-11-21T15:00:00Z') };
    expect(motivoSinSalida(campana, AHORA)).toBeNull();
    expect(motivoSinSalida(campana, new Date('2026-11-21T15:00:00Z'))).toBe('FUERA_DE_CAMPANA');
  });

  it('con todos los premios agotados solo sale "Sigue intentando"', () => {
    const sinStock = Object.fromEntries(
      ['p20', 'bolsas', 'p50', 'gorra', 'kit', 'p10', 'botella'].map((id) => [id, { stock: 0 }]),
    );
    const cuenta = frecuencias(ruleta(sinStock));
    expect(cuenta.get('nada')).toBe(10_000);
  });

  it('las probabilidades que se muestran son las que sortea el servidor', () => {
    const premios = ruleta({ gorra: { stock: 0 } });
    const mostradas = probabilidadesEfectivas(premios, AHORA);
    const cuenta = frecuencias(premios);
    for (const p of premios) expect((mostradas.get(p.id) ?? 0) * 100).toBe(cuenta.get(p.id) ?? 0);
    expect([...mostradas.values()].reduce((suma, valor) => suma + valor, 0)).toBeCloseTo(100, 5);
    expect(mostradas.get('gorra')).toBe(0);
    expect(mostradas.get('nada')).toBe(28);
  });

  it('una ruleta que no suma 100 % o sin segmento sin premio no se puede usar', () => {
    expect(() => validarRuleta(ruleta().map((p) => (p.id === 'p10' ? { ...p, probabilidad: 20 } : p)))).toThrow(
      RuletaMalConfigurada,
    );
    expect(() => validarRuleta(ruleta().filter((p) => p.tipo !== 'SIN_PREMIO'))).toThrow(RuletaMalConfigurada);
    expect(() => sortear(ruleta().slice(0, 3), 5, AHORA)).toThrow(RuletaMalConfigurada);
  });
});
