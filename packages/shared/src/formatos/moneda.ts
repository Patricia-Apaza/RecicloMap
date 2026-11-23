const ESPACIO_FIJO = ' ';

const formatoMonto = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function aNumero(valor: number | string): number {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (!Number.isFinite(numero)) {
    throw new RangeError(`Monto no válido: ${String(valor)}`);
  }
  return numero;
}

// Perú usa coma para miles y punto para decimales: 1,234.50
export function formatearMonto(valor: number | string): string {
  return formatoMonto.format(aNumero(valor));
}

// El espacio fijo evita que "S/" y la cifra se separen al final de una línea
export function formatearSoles(valor: number | string): string {
  return `S/${ESPACIO_FIJO}${formatearMonto(valor)}`;
}

export function formatearRangoPrecio(minimo: number | string, maximo: number | string): string {
  return `${formatearSoles(minimo)}–${formatearMonto(maximo)}`;
}

export function formatearPrecioPorKg(valor: number | string): string {
  return `${formatearSoles(valor)} por kg`;
}
