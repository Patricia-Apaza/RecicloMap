import { Injectable, Logger } from '@nestjs/common';
import type { ModoRuta } from '@reciclomap/shared';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import type { Punto } from './mapa.repositorio.js';

const URL_RUTAS = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const CAMPOS =
  'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.transitDetails.headsign';
const MODO: Record<ModoRuta, string> = { pie: 'WALK', moto: 'TWO_WHEELER', transporte: 'TRANSIT' };
// Tres decimales: unos 110 m. Google nunca recibe la posición exacta del reciclador
const DECIMALES_ORIGEN = 3;

export type Ruta = { distanciaMetros: number; duracionSegundos: number; trazo: string | null; pasos: string[] };

type RespuestaRutas = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    legs?: Array<{
      steps?: Array<{ navigationInstruction?: { instructions?: string }; transitDetails?: { headsign?: string } }>;
    }>;
  }>;
};

export const redondear = (punto: Punto): Punto => ({
  lat: Number(punto.lat.toFixed(DECIMALES_ORIGEN)),
  lng: Number(punto.lng.toFixed(DECIMALES_ORIGEN)),
});

// "Abrir en Google Maps" solo lleva el destino: Google Maps usa la ubicación que el propio teléfono decida
export const enlaceDestino = (destino: Punto) =>
  `https://www.google.com/maps/dir/?api=1&destination=${destino.lat.toFixed(6)},${destino.lng.toFixed(6)}`;

@Injectable()
export class RutasGoogle {
  private readonly registro = new Logger('RutasGoogle');

  constructor(private readonly configuracion: Configuracion) {}

  get disponible(): boolean {
    return Boolean(this.configuracion.googleMaps.claveServidor);
  }

  async calcular(origen: Punto, destino: Punto, modo: ModoRuta): Promise<Ruta | null> {
    const clave = this.configuracion.googleMaps.claveServidor;
    if (!clave) return null;
    const desde = redondear(origen);
    try {
      const respuesta = await fetch(URL_RUTAS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': CAMPOS },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: desde.lat, longitude: desde.lng } } },
          destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
          travelMode: MODO[modo],
          languageCode: 'es-419',
          units: 'METRIC',
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!respuesta.ok) {
        this.registro.warn(`Routes API respondió ${respuesta.status}`);
        return null;
      }
      const ruta = ((await respuesta.json()) as RespuestaRutas).routes?.[0];
      if (!ruta?.distanceMeters || !ruta.duration) return null;
      const pasos = (ruta.legs ?? [])
        .flatMap((tramo) => tramo.steps ?? [])
        .map(
          (paso) =>
            paso.navigationInstruction?.instructions ??
            (paso.transitDetails?.headsign ? `Toma el transporte hacia ${paso.transitDetails.headsign}` : ''),
        )
        .filter(Boolean)
        .slice(0, 12);
      return {
        distanciaMetros: ruta.distanceMeters,
        duracionSegundos: Number.parseInt(ruta.duration, 10) || 0,
        trazo: ruta.polyline?.encodedPolyline ?? null,
        pasos,
      };
    } catch (error) {
      this.registro.warn(`No se pudo calcular la ruta: ${(error as Error).message}`);
      return null;
    }
  }
}
