import { Injectable } from '@nestjs/common';
import type { CodigoMaterial } from '@reciclomap/shared';
import { Prisma } from '../../generado/prisma/client.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { type HorarioDia, horaTexto } from './apertura.js';

export type Punto = { lat: number; lng: number };

// Una fila por negocio visible y material: verificado, activo y sin el precio suspendido
export type FilaMapa = {
  id: string;
  tipo: 'CENTRO' | 'MOVIL';
  nombre: string;
  esPro: boolean;
  califProm: number;
  califCant: number;
  disponibilidad: 'DISPONIBLE' | 'EN_RUTA' | 'FUERA_DE_SERVICIO';
  material: CodigoMaterial;
  materialNombre: string;
  min: number;
  max: number;
  demanda: 'ALTA' | 'MEDIA' | 'BAJA';
  actualizadoEn: Date;
  lat: number;
  lng: number;
  metros: number;
  vehiculo: string | null;
  zona: string | null;
};

const referencia = (punto: Punto) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${punto.lng}::float8, ${punto.lat}::float8), 4326)::geography`;

const COLUMNAS = (punto: Punto) => Prisma.sql`
  v.comprador_id AS id, v.tipo::text AS tipo, v.nombre_comercial AS nombre, v.es_pro AS "esPro",
  v.calif_prom::float8 AS "califProm", v.calif_cant AS "califCant", v.disponibilidad::text AS disponibilidad,
  m.codigo AS material, m.nombre AS "materialNombre",
  v.precio_min::float8 AS min, v.precio_max::float8 AS max, v.demanda::text AS demanda, v.actualizado_en AS "actualizadoEn",
  ST_Y(v.punto::geometry) AS lat, ST_X(v.punto::geometry) AS lng,
  ST_Distance(v.punto, ${referencia(punto)}) AS metros,
  c.vehiculo::text AS vehiculo, z.nombre AS zona`;

const ORIGEN = Prisma.sql`
  FROM v_mapa v
  JOIN material m ON m.id = v.material_id
  JOIN comprador c ON c.id = v.comprador_id
  LEFT JOIN zona z ON z.id = v.zona_id`;

@Injectable()
export class MapaRepositorio {
  constructor(private readonly prisma: PrismaApi) {}

  // Negocios que compran el material dentro del radio, medidos desde el punto de referencia
  opcionesCercanas(material: CodigoMaterial, punto: Punto, radioKm: number, cliente: ClienteBd = this.prisma) {
    return cliente.$queryRaw<FilaMapa[]>`
      SELECT ${COLUMNAS(punto)} ${ORIGEN}
      WHERE m.codigo = ${material} AND ST_DWithin(v.punto, ${referencia(punto)}, ${radioKm * 1000})`;
  }

  // Todos los materiales visibles de un negocio
  materialesDe(compradorId: string, punto: Punto) {
    return this.prisma.$queryRaw<FilaMapa[]>`
      SELECT ${COLUMNAS(punto)} ${ORIGEN}
      WHERE v.comprador_id = ${compradorId}::uuid
      ORDER BY m.orden`;
  }

  async horariosYPagos(ids: string[]) {
    if (ids.length === 0) return { horarios: new Map<string, HorarioDia[]>(), pagos: new Map<string, string[]>() };
    const [horarios, pagos] = await Promise.all([
      this.prisma.compradorHorario.findMany({
        where: { compradorId: { in: ids } },
        select: { compradorId: true, dia: true, abre: true, cierra: true },
        orderBy: { dia: 'asc' },
      }),
      this.prisma.compradorPago.findMany({
        where: { compradorId: { in: ids } },
        select: { compradorId: true, metodo: true },
      }),
    ]);
    const porHorario = new Map<string, HorarioDia[]>();
    for (const fila of horarios) {
      porHorario.set(fila.compradorId, [
        ...(porHorario.get(fila.compradorId) ?? []),
        { dia: fila.dia, abre: horaTexto(fila.abre), cierra: horaTexto(fila.cierra) },
      ]);
    }
    const porPago = new Map<string, string[]>();
    for (const fila of pagos) porPago.set(fila.compradorId, [...(porPago.get(fila.compradorId) ?? []), fila.metodo]);
    return { horarios: porHorario, pagos: porPago };
  }

  fichaPublica(compradorId: string) {
    return this.prisma.comprador.findFirst({
      where: { id: compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
      select: {
        id: true,
        descripcion: true,
        direccion: true,
        telefonoNegocio: true,
        whatsapp: true,
        horaInicio: true,
        horaFin: true,
        rutaPublicada: true,
        diaVigente: true,
        paradas: {
          orderBy: { orden: 'asc' },
          select: { desde: true, hasta: true, zona: { select: { nombre: true } } },
        },
        zona: { select: { nombre: true } },
        fotos: { select: { archivoId: true }, orderBy: { orden: 'asc' } },
      },
    });
  }

  // RN-17: solo suma al contador; no guarda quién lo pidió y el negocio no recibe aviso
  async registrarLlegada(compradorId: string, material: CodigoMaterial | null): Promise<void> {
    const materialId = material
      ? ((await this.prisma.material.findUnique({ where: { codigo: material }, select: { id: true } }))?.id ?? null)
      : null;
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    await this.prisma.solicitudLlegada.create({
      data: { compradorId, materialId, fecha: new Date(`${hoy}T00:00:00Z`) },
    });
  }

  async centroDeZona(zonaId: number): Promise<Punto | null> {
    const filas = await this.prisma.$queryRaw<Punto[]>`
      SELECT ST_Y(centro::geometry) AS lat, ST_X(centro::geometry) AS lng FROM zona WHERE id = ${zonaId}`;
    return filas[0] ?? null;
  }

  async diasPrecioAlDia(): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({
      where: { clave: 'dias_precio_al_dia' },
      select: { valor: true },
    });
    const dias = Number(fila?.valor);
    return Number.isFinite(dias) && dias > 0 ? dias : 7;
  }
}
