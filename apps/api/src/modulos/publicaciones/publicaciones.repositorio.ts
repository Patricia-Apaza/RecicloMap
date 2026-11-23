import { Injectable } from '@nestjs/common';
import type { CodigoMaterial, TramoDistancia } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { Punto } from '../mapa/mapa.repositorio.js';

export type FilaBloqueada = { id: string; estado: string; recicladorId: string; kg: number; venceEn: Date };

// La ubicación de la publicación se escribe pero nunca se lee: todo cálculo pasa por funciones de la base
@Injectable()
export class PublicacionesRepositorio {
  constructor(private readonly prisma: PrismaApi) {}

  async parametro(clave: string, defecto: number): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave }, select: { valor: true } });
    const valor = Number(fila?.valor);
    return Number.isFinite(valor) && valor > 0 ? valor : defecto;
  }

  async materialId(codigo: CodigoMaterial): Promise<number> {
    const material = await this.prisma.material.findUnique({ where: { codigo }, select: { id: true } });
    if (!material) throw new ErrorNegocio('MATERIAL_NO_VALIDO', 'Elige un material de la lista.', 422);
    return material.id;
  }

  async centroDeZona(zonaId: number, ciudadId: number): Promise<Punto | null> {
    const filas = await this.prisma.$queryRaw<Punto[]>`
      SELECT ST_Y(centro::geometry) AS lat, ST_X(centro::geometry) AS lng FROM zona WHERE id = ${zonaId} AND ciudad_id = ${ciudadId}`;
    return filas[0] ?? null;
  }

  async guardarUbicacion(tx: ClienteBd, publicacionId: string, punto: Punto, origen: 'GPS' | 'ZONA'): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO publicacion_ubicacion (publicacion_id, ubicacion, origen)
      VALUES (${publicacionId}::uuid, ST_SetSRID(ST_MakePoint(${punto.lng}::float8, ${punto.lat}::float8), 4326)::geography, ${origen}::origen_ubicacion)`;
  }

  negociosParaAviso(tx: ClienteBd, publicacionId: string, metros: number) {
    return tx.$queryRaw<Array<{ comprador_id: string; usuario_id: string; tramo: TramoDistancia; tipo: string }>>`
      SELECT a.comprador_id, a.usuario_id, a.tramo::text AS tramo, c.tipo::text AS tipo
        FROM negocios_para_aviso(${publicacionId}::uuid, ${metros}::float8) a
        JOIN comprador c ON c.id = a.comprador_id`;
  }

  async cercanas(compradorId: string): Promise<Array<{ id: string; tramo: TramoDistancia }>> {
    const filas = await this.prisma.$queryRaw<Array<{ publicacion_id: string; tramo: TramoDistancia }>>`
      SELECT publicacion_id, tramo::text AS tramo FROM publicaciones_cercanas(${compradorId}::uuid)`;
    return filas.map((fila) => ({ id: fila.publicacion_id, tramo: fila.tramo }));
  }

  async tramo(publicacionId: string, compradorId: string): Promise<TramoDistancia | null> {
    const filas = await this.prisma.$queryRaw<Array<{ tramo: TramoDistancia | null }>>`
      SELECT publicacion_tramo(${publicacionId}::uuid, ${compradorId}::uuid)::text AS tramo`;
    return filas[0]?.tramo ?? null;
  }

  async distanciasKm(publicacionId: string, compradores: string[]): Promise<Map<string, number>> {
    if (compradores.length === 0) return new Map();
    const filas = await this.prisma.$queryRaw<Array<{ id: string; km: string | null }>>`
      SELECT c.id, publicacion_distancia_km(${publicacionId}::uuid, c.id)::text AS km
        FROM comprador c WHERE c.id = ANY(${compradores}::uuid[])`;
    return new Map(filas.filter((fila) => fila.km !== null).map((fila) => [fila.id, Number(fila.km)]));
  }

  // "Lo verán N": todos los negocios verificados y activos de la ciudad, compren o no ese material (RF-23)
  negociosDeLaCiudad(ciudadId: number): Promise<number> {
    return this.prisma.comprador.count({
      where: { estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO', ciudadId } },
    });
  }

  // Bloquea la fila: dos acciones simultáneas sobre la misma publicación se atienden una tras otra
  async bloquear(tx: ClienteBd, publicacionId: string): Promise<FilaBloqueada | null> {
    const filas = await tx.$queryRaw<
      Array<{ id: string; estado: string; reciclador_id: string; cantidad_kg: string; vence_en: Date }>
    >`
      SELECT id, estado::text AS estado, reciclador_id, cantidad_kg::text AS cantidad_kg, vence_en
        FROM publicacion WHERE id = ${publicacionId}::uuid FOR UPDATE`;
    const fila = filas[0];
    return fila
      ? {
          id: fila.id,
          estado: fila.estado,
          recicladorId: fila.reciclador_id,
          kg: Number(fila.cantidad_kg),
          venceEn: fila.vence_en,
        }
      : null;
  }
}

// Última barrera de la base: índice único o restricción violada por una solicitud simultánea
export function esViolacionUnica(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, meta } = error as {
    code?: string;
    meta?: { code?: string; driverAdapterError?: { cause?: { code?: string } } };
  };
  return (
    code === 'P2002' ||
    meta?.code === '23505' ||
    meta?.driverAdapterError?.cause?.code === '23505' ||
    String((error as Error).message ?? '').includes('23505')
  );
}
