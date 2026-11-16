import { calcularSemaforo, type OpcionComparable } from './semaforo.js';

const o = (id: string, min: number, max: number): OpcionComparable => ({ id, min, max });
const resultado = (opciones: OpcionComparable[]) => Object.fromEntries(calcularSemaforo(opciones));

describe('Semáforo (RN-01)', () => {
  it('sin opciones no hay nada que comparar', () => {
    expect(resultado([])).toEqual({});
  });

  it('con una sola opción: "Sin comparación"', () => {
    expect(resultado([o('a', 1, 2)])).toEqual({ a: 'SIN_COMPARACION' });
  });

  it('si todas tienen el mismo punto medio: "Sin comparación"', () => {
    expect(resultado([o('a', 1, 2), o('b', 1.2, 1.8), o('c', 1.5, 1.5)])).toEqual({
      a: 'SIN_COMPARACION',
      b: 'SIN_COMPARACION',
      c: 'SIN_COMPARACION',
    });
  });

  it('con 2 opciones distintas: Mejor y Bajo, nunca Intermedio', () => {
    expect(resultado([o('a', 2, 2.4), o('b', 2.5, 2.8)])).toEqual({ a: 'BAJO', b: 'MEJOR' });
  });

  it('con 3 o más: tercios sobre el punto medio', () => {
    // Puntos medios 1.00, 1.50, 2.00, 2.50, 3.00: tercios de 0.666…
    expect(
      resultado([o('a', 0.9, 1.1), o('b', 1.4, 1.6), o('c', 1.9, 2.1), o('d', 2.4, 2.6), o('e', 2.9, 3.1)]),
    ).toEqual({ a: 'BAJO', b: 'BAJO', c: 'INTERMEDIO', d: 'MEJOR', e: 'MEJOR' });
  });

  it('los bordes de cada tercio cuentan hacia arriba', () => {
    // Puntos medios 0, 1, 2, 3 (en soles, desplazados): límites en 1 y 2 exactos
    expect(resultado([o('a', 1, 1), o('b', 2, 2), o('c', 3, 3), o('d', 4, 4)])).toEqual({
      a: 'BAJO',
      b: 'INTERMEDIO',
      c: 'MEJOR',
      d: 'MEJOR',
    });
  });

  it('se calcula con el punto medio del rango, no con el máximo', () => {
    // b tiene el máximo más alto, pero su punto medio (1.75) es el menor; c (2.10) queda en el tercio del medio
    expect(resultado([o('a', 2.5, 2.7), o('b', 0.5, 3), o('c', 2, 2.2)])).toEqual({
      a: 'MEJOR',
      b: 'BAJO',
      c: 'INTERMEDIO',
    });
  });

  it('el resultado no depende del orden de entrada', () => {
    const opciones = [o('a', 0.9, 1.1), o('b', 1.4, 1.6), o('c', 2.9, 3.1)];
    expect(resultado([...opciones].reverse())).toEqual(resultado(opciones));
  });

  it('el redondeo de céntimos no cambia un tercio', () => {
    expect(resultado([o('a', 0.1, 0.1), o('b', 0.2, 0.2), o('c', 0.3, 0.3)])).toEqual({
      a: 'BAJO',
      b: 'INTERMEDIO',
      c: 'MEJOR',
    });
  });
});
