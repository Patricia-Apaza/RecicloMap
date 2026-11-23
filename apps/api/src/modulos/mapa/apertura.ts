import type { Disponibilidad } from '../../generado/prisma/enums.js';

export type Apertura = { abierto: boolean | null; texto: string; tono: 'open' | 'closed' | 'warn' | 'grey' };
export type HorarioDia = { dia: number; abre: string; cierra: string };

const DIAS_INGLES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Día (1 = lunes) y hora "HH:MM" en Juliaca, sin importar la zona horaria del servidor
export function ahoraEnLima(fecha: Date = new Date()): { dia: number; hora: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return { dia: DIAS_INGLES.indexOf(valor('weekday')) + 1, hora: `${valor('hour')}:${valor('minute')}` };
}

export const horaTexto = (fecha: Date) => fecha.toISOString().slice(11, 16);

// Centro: según su horario; sin horario declarado no se inventa un estado
export function aperturaCentro(horarios: HorarioDia[], fecha: Date = new Date()): Apertura {
  if (horarios.length === 0) return { abierto: null, texto: 'Horario no indicado', tono: 'grey' };
  const { dia, hora } = ahoraEnLima(fecha);
  const hoy = horarios.find((horario) => horario.dia === dia);
  if (hoy && hora >= hoy.abre && hora < hoy.cierra)
    return { abierto: true, texto: `Abierto hasta ${hoy.cierra}`, tono: 'open' };
  if (hoy && hora < hoy.abre) return { abierto: false, texto: `Cerrado · abre ${hoy.abre}`, tono: 'closed' };
  return { abierto: false, texto: 'Cerrado', tono: 'closed' };
}

// Comprador móvil: según la disponibilidad que él mismo marca, no según un horario
export function aperturaMovil(disponibilidad: Disponibilidad): Apertura {
  if (disponibilidad === 'DISPONIBLE') return { abierto: true, texto: 'Disponible', tono: 'open' };
  if (disponibilidad === 'EN_RUTA') return { abierto: true, texto: 'En ruta', tono: 'warn' };
  return { abierto: false, texto: 'Fuera de servicio', tono: 'closed' };
}
