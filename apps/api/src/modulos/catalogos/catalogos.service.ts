import { Injectable } from '@nestjs/common';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { RADIOS_KM } from '@reciclomap/shared';

@Injectable()
export class CatalogosService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly configuracion: Configuracion,
  ) {}

  materiales() {
    return this.prisma.material.findMany({
      orderBy: { orden: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    });
  }

  ciudades() {
    return this.prisma.ciudad.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, nombre: true, region: true, estado: true },
    });
  }

  async zonas(ciudadId: number) {
    if (!(await this.prisma.ciudad.count({ where: { id: ciudadId } }))) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa ciudad.', 404);
    }
    // El centro de la zona es público: sirve para centrar el mapa y como zona manual
    return this.prisma.$queryRaw<Array<{ id: number; nombre: string; lat: number; lng: number }>>`
      SELECT id, nombre, ST_Y(centro::geometry) AS lat, ST_X(centro::geometry) AS lng
        FROM zona WHERE ciudad_id = ${ciudadId} ORDER BY nombre`;
  }

  // Rango real por material entre los precios visibles de negocios verificados de la ciudad (pantalla 01)
  async referencia(ciudadId?: number) {
    const ciudad =
      ciudadId ??
      (
        await this.prisma.ciudad.findFirst({
          where: { estado: 'ACTIVA' },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!ciudad) return { ciudad: null, materiales: [] };
    const [datosCiudad, filas] = await Promise.all([
      this.prisma.ciudad.findUnique({ where: { id: ciudad }, select: { id: true, nombre: true } }),
      this.prisma.$queryRaw<Array<{ codigo: string; nombre: string; min: number; max: number; negocios: number }>>`
        SELECT m.codigo, m.nombre, MIN(v.precio_min)::float8 AS min, MAX(v.precio_max)::float8 AS max,
               COUNT(DISTINCT v.comprador_id)::int AS negocios
          FROM v_mapa v JOIN material m ON m.id = v.material_id
         WHERE v.ciudad_id = ${ciudad}
         GROUP BY m.codigo, m.nombre, m.orden
         ORDER BY m.orden`,
    ]);
    if (!datosCiudad) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa ciudad.', 404);
    return {
      ciudad: datosCiudad,
      materiales: filas.map((fila) => ({ ...fila, min: fila.min.toFixed(2), max: fila.max.toFixed(2) })),
    };
  }

  async configuracionPublica() {
    const filas = await this.prisma.parametro.findMany({
      where: { clave: { in: ['radio_defecto_km', 'dias_precio_al_dia', 'precio_kg_minimo', 'precio_kg_maximo'] } },
      select: { clave: true, valor: true },
    });
    const valor = (clave: string, defecto: number) =>
      Number(filas.find((fila) => fila.clave === clave)?.valor ?? defecto);
    return {
      radiosKm: [...RADIOS_KM],
      radioDefectoKm: valor('radio_defecto_km', 5),
      diasPrecioAlDia: valor('dias_precio_al_dia', 7),
      precioKg: { minimo: valor('precio_kg_minimo', 0.1).toFixed(2), maximo: valor('precio_kg_maximo', 50).toFixed(2) },
      // La clave del navegador es pública por diseño: Google la restringe a los dominios del proyecto
      googleMaps: this.configuracion.googleMaps.claveNavegador
        ? { clave: this.configuracion.googleMaps.claveNavegador, idMapa: this.configuracion.googleMaps.idMapa }
        : null,
      // El mapa funciona sin clave: Leaflet con teselas de OpenStreetMap, o Google si se eligió ese proveedor
      mapa: {
        proveedor: this.configuracion.mapa.proveedor,
        teselas: this.configuracion.mapa.teselas,
        google:
          this.configuracion.mapa.proveedor === 'google' && this.configuracion.googleMaps.claveNavegador
            ? { clave: this.configuracion.googleMaps.claveNavegador, idMapa: this.configuracion.googleMaps.idMapa }
            : null,
        pinObligatorio: this.configuracion.mapa.pinObligatorio,
      },
      // Clave pública de Web Push; null si el proyecto aún no configuró el envío
      push: this.configuracion.push ? { clavePublica: this.configuracion.push.clavePublica } : null,
      soporte: { correo: this.configuracion.soporteCorreo },
      // Con clave de servidor, "Cómo llegar" muestra el trazo; sin ella, solo el enlace a Google Maps
      rutas: Boolean(this.configuracion.googleMaps.claveServidor),
    };
  }
}
