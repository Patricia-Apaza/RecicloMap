import { type Ordenable, ordenar } from './ordenar.js';

const opcion = (id: string, cambios: Partial<Ordenable> = {}): Ordenable => ({
  id,
  esPro: false,
  metros: 1000,
  medio: 200,
  demanda: 'MEDIA',
  calificacion: { promedio: 4, cantidad: 10 },
  ...cambios,
});

const ids = (lista: Array<{ id: string }>) => lista.map((item) => item.id);

describe('Orden de los resultados (RN-03)', () => {
  const lista = [
    opcion('cerca-barato', { metros: 500, medio: 150 }),
    opcion('pro-lejos-caro', {
      esPro: true,
      metros: 4000,
      medio: 260,
      demanda: 'ALTA',
      calificacion: { promedio: 4.9, cantidad: 30 },
    }),
    opcion('medio', { metros: 2000, medio: 280, demanda: 'BAJA', calificacion: { promedio: 3.5, cantidad: 8 } }),
    opcion('nuevo', { metros: 3000, medio: 220, calificacion: { promedio: 5, cantidad: 1 } }),
  ];

  it('"Recomendado" pone primero a los Pro como "Destacado" y luego por cercanía', () => {
    const resultado = ordenar(lista, 'recomendado');
    expect(ids(resultado)).toEqual(['pro-lejos-caro', 'cerca-barato', 'medio', 'nuevo']);
    expect(resultado.map((item) => item.destacado)).toEqual([true, false, false, false]);
  });

  it('con orden por precio, un Pro no sube de puesto', () => {
    const conPro = ordenar(lista, 'precio');
    const sinPro = ordenar(
      lista.map((item) => ({ ...item, esPro: false })),
      'precio',
    );
    expect(ids(conPro)).toEqual(ids(sinPro));
    expect(ids(conPro)).toEqual(['medio', 'pro-lejos-caro', 'nuevo', 'cerca-barato']);
    expect(conPro.some((item) => item.destacado)).toBe(false);
  });

  it.each(['cercania', 'demanda', 'calificacion'] as const)(
    'con orden por %s, ser Pro no cambia el puesto',
    (orden) => {
      const conPro = ordenar(lista, orden);
      const sinPro = ordenar(
        lista.map((item) => ({ ...item, esPro: false })),
        orden,
      );
      expect(ids(conPro)).toEqual(ids(sinPro));
    },
  );

  it('"Nuevo" (menos de 3 calificaciones) no gana por calificación', () => {
    expect(ids(ordenar(lista, 'calificacion'))).toEqual(['pro-lejos-caro', 'cerca-barato', 'medio', 'nuevo']);
  });

  it('demanda alta primero; el empate se resuelve por cercanía', () => {
    expect(ids(ordenar(lista, 'demanda'))).toEqual(['pro-lejos-caro', 'cerca-barato', 'nuevo', 'medio']);
  });
});
