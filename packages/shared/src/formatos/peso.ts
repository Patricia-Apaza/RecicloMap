const ESPACIO_FIJO = ' ';

const formatoKilos = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

export function formatearNumero(valor: number | string): string {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(numero)) {
    throw new RangeError(`Número no válido: ${String(valor)}`);
  }
  return formatoKilos.format(numero);
}

export function formatearKg(valor: number | string): string {
  return `${formatearNumero(valor)}${ESPACIO_FIJO}kg`;
}
