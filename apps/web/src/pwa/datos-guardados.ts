// Fecha de los datos que se están mostrando desde la copia guardada, cuando no hay conexión
type Oyente = (fecha: string | null) => void;
const oyentes = new Set<Oyente>();
let fecha: string | null = null;

export function marcarDatosDeCopia(guardadoEn: string | null): void {
  fecha = guardadoEn;
  for (const oyente of oyentes) oyente(fecha);
}

export const datosDeCopia = (): string | null => fecha;

export function escucharDatosDeCopia(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

// Al cerrar la sesión se borran los datos guardados en este dispositivo
export function limpiarDatosGuardados(): void {
  marcarDatosDeCopia(null);
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.ready
      .then((registro) => registro.active?.postMessage({ tipo: 'limpiar-datos' }))
      .catch(() => undefined);
  }
}
