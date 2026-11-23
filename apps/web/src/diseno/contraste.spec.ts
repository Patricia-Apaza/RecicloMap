import { describe, expect, it } from 'vitest';
import { PARES_PROTOTIPO, PARES_REPORTADOS, razonContraste } from './contraste';

const AA_TEXTO_NORMAL = 4.5;
const esReportado = (texto: string, fondo: string) =>
  PARES_REPORTADOS.some((par) => par.texto === texto && par.fondo === fondo);

describe('contraste de la paleta', () => {
  it('calcula la razón de WCAG', () => {
    expect(razonContraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(razonContraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it.each(PARES_PROTOTIPO.filter((par) => !esReportado(par.texto, par.fondo)))(
    '$texto sobre $fondo cumple AA ($uso)',
    ({ colorTexto, colorFondo }) => {
      expect(razonContraste(colorTexto, colorFondo)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL);
    },
  );

  // Si un par reportado empieza a cumplir, hay que sacarlo de la lista
  it.skipIf(PARES_REPORTADOS.length === 0).each(PARES_REPORTADOS)(
    '$texto sobre $fondo sigue por debajo de AA y está reportado',
    ({ texto, fondo }) => {
      const par = PARES_PROTOTIPO.find((candidato) => candidato.texto === texto && candidato.fondo === fondo);
      expect(par).toBeDefined();
      expect(razonContraste(par!.colorTexto, par!.colorFondo)).toBeLessThan(AA_TEXTO_NORMAL);
    },
  );

  it('el semáforo y la demanda cumplen AA en todos sus estados', () => {
    const estados = PARES_PROTOTIPO.filter((par) => /Semáforo|demanda/i.test(par.uso));
    expect(estados.length).toBeGreaterThanOrEqual(6);
    for (const par of estados) {
      expect(razonContraste(par.colorTexto, par.colorFondo)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL);
    }
  });
});
