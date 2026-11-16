import type { OrdenMapa } from '@reciclomap/shared';

export type Ordenable = {
  id: string;
  esPro: boolean;
  metros: number;
  medio: number;
  demanda: 'ALTA' | 'MEDIA' | 'BAJA';
  calificacion: { promedio: number; cantidad: number };
};

const PESO_DEMANDA = { ALTA: 3, MEDIA: 2, BAJA: 1 } as const;
const MINIMO_CALIFICACIONES = 3;

// El desempate siempre es la cercanía y luego el identificador: el orden es estable
const desempate = (a: Ordenable, b: Ordenable) => a.metros - b.metros || a.id.localeCompare(b.id);

const COMPARAR: Record<Exclude<OrdenMapa, 'recomendado'>, (a: Ordenable, b: Ordenable) => number> = {
  precio: (a, b) => b.medio - a.medio || desempate(a, b),
  cercania: desempate,
  demanda: (a, b) => PESO_DEMANDA[b.demanda] - PESO_DEMANDA[a.demanda] || desempate(a, b),
  calificacion: (a, b) => {
    // Con menos de 3 calificaciones es "Nuevo": no compite por calificación
    const valor = (x: Ordenable) => (x.calificacion.cantidad >= MINIMO_CALIFICACIONES ? x.calificacion.promedio : -1);
    return valor(b) - valor(a) || desempate(a, b);
  },
};

// RN-03: el plan Pro solo cuenta en "Recomendado", donde va primero como "Destacado"
export function ordenar<T extends Ordenable>(opciones: T[], orden: OrdenMapa): Array<T & { destacado: boolean }> {
  if (orden === 'recomendado') {
    const destacados = opciones.filter((opcion) => opcion.esPro).sort(desempate);
    const resto = opciones.filter((opcion) => !opcion.esPro).sort(desempate);
    return [
      ...destacados.map((opcion) => ({ ...opcion, destacado: true })),
      ...resto.map((opcion) => ({ ...opcion, destacado: false })),
    ];
  }
  return [...opciones].sort(COMPARAR[orden]).map((opcion) => ({ ...opcion, destacado: false }));
}
