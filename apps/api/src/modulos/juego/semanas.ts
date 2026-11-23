import { sumarDias } from '../estadisticas/fechas.js';

// Las semanas van de lunes a domingo, en días de Lima
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return sumarDias(fecha, -((dia + 6) % 7));
}

export const primerDiaDelMes = (fecha: string): string => `${fecha.slice(0, 7)}-01`;

export function primerDiaDelMesSiguiente(mes: string): string {
  const [anio = 0, numero = 1] = mes.split('-').map(Number);
  return numero === 12 ? `${anio + 1}-01-01` : `${anio}-${String(numero + 1).padStart(2, '0')}-01`;
}

export function primerDiaDelMesAnterior(mes: string): string {
  const [anio = 0, numero = 1] = mes.split('-').map(Number);
  return numero === 1 ? `${anio - 1}-12-01` : `${anio}-${String(numero - 1).padStart(2, '0')}-01`;
}

// Semanas (cada una identificada por su lunes) ordenadas: la racha más larga de semanas seguidas
export function rachaMaxima(lunes: string[]): number {
  let mejor = 0;
  let actual = 0;
  let anterior: string | null = null;
  for (const semana of [...new Set(lunes)].sort()) {
    actual = anterior !== null && sumarDias(anterior, 7) === semana ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
    anterior = semana;
  }
  return mejor;
}

// Racha vigente: llega a la semana de hoy o a la anterior (la semana en curso aún puede cumplirse)
export function rachaActual(lunes: string[], hoy: string): number {
  const semanas = new Set(lunes);
  const estaSemana = lunesDe(hoy);
  let cursor = semanas.has(estaSemana) ? estaSemana : sumarDias(estaSemana, -7);
  let largo = 0;
  while (semanas.has(cursor)) {
    largo++;
    cursor = sumarDias(cursor, -7);
  }
  return largo;
}
