import { hoyEnLima } from '../estadisticas/fechas.js';

export const dia = (fecha: Date | null): string | null => (fecha ? fecha.toISOString().slice(0, 10) : null);

type FilaPlan = { plan: string; planDesde: Date | null; planHasta: Date | null };

// El plan Pro rige de planDesde a planHasta, ambos días incluidos, en hora de Lima
export function proVigente(fila: FilaPlan, hoy: string = hoyEnLima()): boolean {
  const desde = dia(fila.planDesde);
  const hasta = dia(fila.planHasta);
  return fila.plan === 'PRO' && !!desde && !!hasta && desde <= hoy && hoy <= hasta;
}

export function diasHasta(fecha: string, hoy: string = hoyEnLima()): number {
  return Math.round((new Date(`${fecha}T12:00:00Z`).getTime() - new Date(`${hoy}T12:00:00Z`).getTime()) / 86_400_000);
}
