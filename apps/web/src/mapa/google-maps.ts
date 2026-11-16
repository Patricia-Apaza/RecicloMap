'use client';

// Carga Google Maps una sola vez y solo cuando una pantalla lo pide: la lista no lo espera
let carga: Promise<typeof google.maps> | null = null;

export function cargarGoogleMaps(clave: string): Promise<typeof google.maps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Sin navegador'));
  const ventana = window as unknown as { google?: { maps?: typeof google.maps }; __rmMapaListo?: () => void };
  if (ventana.google?.maps?.importLibrary) return Promise.resolve(ventana.google.maps);
  carga ??= new Promise<typeof google.maps>((resolver, rechazar) => {
    ventana.__rmMapaListo = () => {
      if (ventana.google?.maps) resolver(ventana.google.maps);
      else rechazar(new Error('Google Maps no respondió'));
    };
    const parametros = new URLSearchParams({
      key: clave,
      v: 'weekly',
      language: 'es',
      region: 'PE',
      loading: 'async',
      callback: '__rmMapaListo',
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${parametros.toString()}`;
    script.async = true;
    script.onerror = () => {
      carga = null;
      rechazar(new Error('No se pudo cargar Google Maps'));
    };
    document.head.appendChild(script);
  });
  return carga;
}

export const JULIACA = { lat: -15.4935, lng: -70.1335 };
