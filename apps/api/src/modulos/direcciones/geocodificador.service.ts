import { Injectable } from '@nestjs/common';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

export type ResultadoDireccion = { nombre: string; lat: number; lng: number };

type FilaNominatim = { display_name?: string; lat?: string; lon?: string };

// Nominatim público: máximo 1 solicitud por segundo para toda la app
const ESPERA_MINIMA_MS = 1100;
const VIGENCIA_CACHE_MS = 24 * 3_600_000;
const MAXIMO_EN_CACHE = 500;
const TIEMPO_MAXIMO_MS = 6000;

const normalizar = (texto: string) => texto.trim().toLowerCase().replace(/\s+/g, ' ');

@Injectable()
export class Geocodificador {
  private readonly cache = new Map<string, { vence: number; datos: ResultadoDireccion[] }>();
  private cola: Promise<unknown> = Promise.resolve();
  private ultimaSolicitud = 0;

  constructor(private readonly configuracion: Configuracion) {}

  async buscar(consulta: string): Promise<ResultadoDireccion[]> {
    const clave = normalizar(consulta);
    const guardado = this.cache.get(clave);
    if (guardado && guardado.vence > Date.now()) return guardado.datos;

    // Una sola cola para toda la app: la espera mínima se cumple aunque lleguen varias búsquedas a la vez
    const turno = this.cola.then(async () => {
      const otraYaLaTrajo = this.cache.get(clave);
      if (otraYaLaTrajo && otraYaLaTrajo.vence > Date.now()) return otraYaLaTrajo.datos;
      const espera = this.ultimaSolicitud + ESPERA_MINIMA_MS - Date.now();
      if (espera > 0) await new Promise((resolver) => setTimeout(resolver, espera));
      this.ultimaSolicitud = Date.now();
      const datos = await this.consultar(consulta.trim());
      this.guardar(clave, datos);
      return datos;
    });
    this.cola = turno.catch(() => undefined);
    return turno;
  }

  private guardar(clave: string, datos: ResultadoDireccion[]) {
    if (this.cache.size >= MAXIMO_EN_CACHE) {
      const primera = this.cache.keys().next().value;
      if (primera !== undefined) this.cache.delete(primera);
    }
    this.cache.set(clave, { vence: Date.now() + VIGENCIA_CACHE_MS, datos });
  }

  // La solicitud sale del servidor: el servicio no recibe la IP ni ningún dato de la persona, solo el texto que buscó
  private async consultar(texto: string): Promise<ResultadoDireccion[]> {
    const { url, identidad } = this.configuracion.geocodificador;
    const parametros = new URLSearchParams({
      q: texto,
      format: 'jsonv2',
      countrycodes: 'pe',
      limit: '5',
      'accept-language': 'es',
    });
    try {
      const respuesta = await fetch(`${url}/search?${parametros.toString()}`, {
        headers: { 'User-Agent': identidad, Accept: 'application/json', 'Accept-Language': 'es' },
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      });
      if (!respuesta.ok) throw new Error(`Estado ${respuesta.status}`);
      const filas = (await respuesta.json()) as FilaNominatim[];
      return filas
        .map((fila) => ({
          nombre: (fila.display_name ?? '').slice(0, 160),
          lat: Number(fila.lat),
          lng: Number(fila.lon),
        }))
        .filter((r) => r.nombre && Number.isFinite(r.lat) && Number.isFinite(r.lng));
    } catch {
      throw new ErrorNegocio(
        'BUSQUEDA_NO_DISPONIBLE',
        'No pudimos buscar la dirección ahora. Toca el mapa para colocar el pin.',
        503,
      );
    }
  }
}
