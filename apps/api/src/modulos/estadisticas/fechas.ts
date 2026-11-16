// Todo se cuenta por días y semanas de America/Lima (UTC-5, sin horario de verano)
export const hoyEnLima = (ahora: Date = new Date()): string =>
  ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export const horaEnLima = (ahora: Date = new Date()): number =>
  Number(ahora.toLocaleString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

export function sumarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export type Tramo = { desde: string; hasta: string };

// Tramos consecutivos de `tamano` días desde `desde` hasta `hasta`; el último puede ser más corto
export function tramos(desde: string, hasta: string, tamano: number): Tramo[] {
  const lista: Tramo[] = [];
  for (let inicio = desde; inicio <= hasta; inicio = sumarDias(inicio, tamano)) {
    const fin = sumarDias(inicio, tamano - 1);
    lista.push({ desde: inicio, hasta: fin > hasta ? hasta : fin });
  }
  return lista;
}

export const enTramo = (fecha: string, tramo: Tramo) => fecha >= tramo.desde && fecha <= tramo.hasta;
