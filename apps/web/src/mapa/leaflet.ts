'use client';

import type * as Leaflet from 'leaflet';
import type { ConfigMapa } from './configuracion';

export type Leaf = typeof Leaflet;
export type Punto = { lat: number; lng: number };

let carga: Promise<Leaf> | null = null;

// Leaflet y sus estilos se piden solo cuando una pantalla muestra un mapa
export function cargarLeaflet(): Promise<Leaf> {
  carga ??= Promise.all([import('leaflet'), import('./leaflet-estilos')])
    .then(([modulo]) => modulo.default ?? modulo)
    .catch((error: unknown) => {
      carga = null;
      throw error;
    });
  return carga;
}

type ConexionNavegador = { saveData?: boolean; effectiveType?: string };

// Con ahorro de datos o conexión de 3G o menos se piden teselas de un nivel menos (cuatro veces menos imágenes)
function conexionLenta(): boolean {
  const conexion = (navigator as Navigator & { connection?: ConexionNavegador }).connection;
  return Boolean(conexion && (conexion.saveData || ['slow-2g', '2g', '3g'].includes(conexion.effectiveType ?? '')));
}

type OpcionesBase = { centro?: Punto; zoom?: number; rueda?: boolean; alFallar?: () => void };

// Mapa base: teselas del proveedor configurado y atribución siempre visible abajo a la derecha
export function crearMapaBase(
  L: Leaf,
  contenedor: HTMLElement,
  cfg: ConfigMapa,
  opciones: OpcionesBase = {},
): Leaflet.Map {
  if (!cfg.teselas) throw new Error('El proveedor de mapas no usa teselas');
  contenedor.classList.add('rm-leaflet');
  contenedor.setAttribute('data-mapa', cfg.proveedor);
  // Sin vista inicial no se pide ninguna tesela: así no se descarga un mapa que enseguida se reemplaza por otro zoom
  const mapa = L.map(contenedor, {
    ...(opciones.centro ? { center: opciones.centro, zoom: opciones.zoom ?? 13 } : {}),
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: opciones.rueda ?? true,
  });
  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar el mapa', zoomOutTitle: 'Alejar el mapa' }).addTo(mapa);
  L.control
    .attribution({
      position: 'bottomright',
      prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>',
    })
    .addTo(mapa);
  const capa = L.tileLayer(cfg.teselas.url, {
    attribution: cfg.teselas.atribucion,
    maxZoom: cfg.teselas.maxZoom,
    // Menos teselas en reserva: cuida los datos del celular y el servidor del mapa
    keepBuffer: 1,
    updateWhenZooming: false,
    ...(conexionLenta() ? { tileSize: 512, zoomOffset: -1 } : {}),
  });
  let cargadas = 0;
  let fallidas = 0;
  capa.on('tileload', () => (cargadas += 1));
  capa.on('tileerror', () => {
    fallidas += 1;
    if (cargadas === 0 && fallidas === 4) opciones.alFallar?.();
  });
  capa.addTo(mapa);
  return mapa;
}

// Un marcador con contenido HTML anclado por su punta (o por su centro)
export function marcadorHtml(
  L: Leaf,
  posicion: Punto,
  contenido: HTMLElement,
  opciones: { titulo?: string; arrastrable?: boolean; centrado?: boolean; z?: number; dato?: string } = {},
): Leaflet.Marker {
  const ancla = document.createElement('div');
  ancla.append(contenido);
  if (opciones.dato) ancla.setAttribute('data-marcador', opciones.dato);
  const icono = L.divIcon({
    html: ancla,
    className: `rm-ancla${opciones.centrado ? ' rm-centrada' : ''}`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
  return L.marker(posicion, {
    icon: icono,
    title: opciones.titulo,
    draggable: opciones.arrastrable ?? false,
    keyboard: false,
    zIndexOffset: opciones.z ?? 0,
  });
}
