import { pedir } from '@/sesion/api';

const CLAVE = 'rm_dispositivo';

// Un identificador aleatorio de este navegador, sin datos personales: el servidor lo mezcla con el día y el negocio
function dispositivo(): string {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return guardado;
    const nuevo = crypto.randomUUID();
    localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    return `sesion-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// Avisa que se abrió la ficha; el servidor cuenta una vez por persona o dispositivo al día
export function registrarVisita(compradorId: string, material: string | null): void {
  void pedir(`/compradores/${compradorId}/visitas`, {
    cuerpo: { material },
    cabeceras: { 'X-Dispositivo': dispositivo() },
  }).catch(() => undefined);
}
