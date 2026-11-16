export const ZONA_HORARIA = 'America/Lima';
export const IDIOMA = 'es-PE';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

type Entrada = Date | string | number;

function aFecha(valor: Entrada): Date {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new RangeError(`Fecha no válida: ${String(valor)}`);
  }
  return fecha;
}

const partesLima = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function enLima(valor: Entrada): { anio: number; mes: number; dia: number; hora: string; minuto: string } {
  const partes = Object.fromEntries(partesLima.formatToParts(aFecha(valor)).map((parte) => [parte.type, parte.value]));
  return {
    anio: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: partes.hour ?? '00',
    minuto: partes.minute ?? '00',
  };
}

// Fecha del calendario de Lima en formato AAAA-MM-DD
export function fechaEnLima(valor: Entrada): string {
  const { anio, mes, dia } = enLima(valor);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function formatearFecha(valor: Entrada): string {
  const { anio, mes, dia } = enLima(valor);
  return `${String(dia).padStart(2, '0')} ${MESES[mes - 1]} ${anio}`;
}

export function formatearHora(valor: Entrada): string {
  const { hora, minuto } = enLima(valor);
  return `${hora}:${minuto}`;
}

export function formatearFechaHora(valor: Entrada): string {
  return `${formatearFecha(valor)} · ${formatearHora(valor)}`;
}

function diasDeCalendarioEntre(desde: Entrada, hasta: Entrada): number {
  const inicio = Date.parse(`${fechaEnLima(desde)}T00:00:00Z`);
  const fin = Date.parse(`${fechaEnLima(hasta)}T00:00:00Z`);
  return Math.round((fin - inicio) / 86_400_000);
}

const plural = (cantidad: number, singular: string, variosTexto: string): string =>
  `hace ${cantidad} ${cantidad === 1 ? singular : variosTexto}`;

export function formatearHace(valor: Entrada, ahora: Entrada = new Date()): string {
  const minutos = Math.floor((aFecha(ahora).getTime() - aFecha(valor).getTime()) / 60_000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;

  const dias = diasDeCalendarioEntre(valor, ahora);
  if (dias === 0) return `hace ${Math.floor(minutos / 60)} h`;
  if (dias === 1) return 'ayer';
  if (dias < 7) return plural(dias, 'día', 'días');
  if (dias < 30) return plural(Math.floor(dias / 7), 'semana', 'semanas');
  if (dias < 365) return plural(Math.floor(dias / 30), 'mes', 'meses');
  return plural(Math.floor(dias / 365), 'año', 'años');
}
