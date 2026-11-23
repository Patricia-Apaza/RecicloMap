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

  it('"Recomendado" ordena por cercanía y marca a los Pro como "Destacado" sin saltarse la distancia', () => {
    const resultado = ordenar(lista, 'recomendado', 500);
    expect(ids(resultado)).toEqual(['cerca-barato', 'medio', 'nuevo', 'pro-lejos-caro']);
    expect(resultado.map((item) => item.destacado)).toEqual([false, false, false, true]);
  });

  it('en "Recomendado" la ventaja del Pro es limitada: solo adelanta a quien está dentro de ese margen', () => {
    const cercanos = [
      opcion('gratis', { metros: 1000 }),
      opcion('pro-algo-mas-lejos', { esPro: true, metros: 1400 }),
      opcion('pro-mas-lejos', { esPro: true, metros: 1600 }),
    ];
    // Con 500 m de ventaja: 1 000 m, 900 m y 1 100 m
    expect(ids(ordenar(cercanos, 'recomendado', 500))).toEqual(['pro-algo-mas-lejos', 'gratis', 'pro-mas-lejos']);
    // Sin ventaja, el plan no pesa
    expect(ids(ordenar(cercanos, 'recomendado', 0))).toEqual(['gratis', 'pro-algo-mas-lejos', 'pro-mas-lejos']);
    // La ventaja nunca deja la distancia por debajo de cero: con una ventaja enorme, entre Pro gana el más cercano
    const entrePro = [
      opcion('pro-lejos', { esPro: true, metros: 300 }),
      opcion('pro-cerca', { esPro: true, metros: 100 }),
    ];
    expect(ids(ordenar(entrePro, 'recomendado', 5000))).toEqual(['pro-cerca', 'pro-lejos']);
  });

  it('sin plan Pro, "Recomendado" es solo cercanía', () => {
    const sinPro = lista.map((item) => ({ ...item, esPro: false }));
    expect(ids(ordenar(sinPro, 'recomendado', 500))).toEqual(ids(ordenar(sinPro, 'cercania')));
  });

  it('con orden por precio, un Pro no sube de puesto', () => {
    const conPro = ordenar(lista, 'precio', 500);
    const sinPro = ordenar(
      lista.map((item) => ({ ...item, esPro: false })),
      'precio',
      500,
    );
    expect(ids(conPro)).toEqual(ids(sinPro));
    expect(ids(conPro)).toEqual(['medio', 'pro-lejos-caro', 'nuevo', 'cerca-barato']);
    expect(conPro.some((item) => item.destacado)).toBe(false);
  });

  it.each(['cercania', 'demanda', 'calificacion'] as const)(
    'con orden por %s, ser Pro no cambia el puesto',
    (orden) => {
      const conPro = ordenar(lista, orden, 5000);
      const sinPro = ordenar(
        lista.map((item) => ({ ...item, esPro: false })),
        orden,
        5000,
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
