// La foto de perfil se elige antes de tener sesión; se sube apenas se verifica el teléfono
let pendiente: File | null = null;

export function guardarFotoPendiente(archivo: File | null): void {
  pendiente = archivo;
}

export function tomarFotoPendiente(): File | null {
  const archivo = pendiente;
  pendiente = null;
  return archivo;
}
