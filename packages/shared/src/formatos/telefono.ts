export const PATRON_TELEFONO = /^9\d{8}$/;

export function normalizarTelefono(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  return digitos.length === 11 && digitos.startsWith('51') ? digitos.slice(2) : digitos;
}

export function esTelefonoValido(valor: string): boolean {
  return PATRON_TELEFONO.test(normalizarTelefono(valor));
}

export function formatearTelefono(valor: string): string {
  const digitos = normalizarTelefono(valor);
  return [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 9)].filter(Boolean).join(' ');
}

export function enlaceWhatsApp(telefono: string, mensaje?: string): string {
  const base = `https://wa.me/51${normalizarTelefono(telefono)}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}
