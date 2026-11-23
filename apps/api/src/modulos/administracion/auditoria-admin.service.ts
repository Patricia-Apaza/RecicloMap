import { Injectable } from '@nestjs/common';
import type { esquemaListaAuditoria } from '@reciclomap/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generado/prisma/client.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { hoyEnLima, sumarDias } from '../estadisticas/fechas.js';

const POR_PAGINA = 25;
// Nada que identifique una ubicación, una contraseña, un código ni un contacto sale en el registro
const PROHIBIDAS =
  /^(lat|lng|latitud|longitud|pin)$|ubicacion|contrasena|clave|hash|token|codigo|telefono|correo|whatsapp/i;

export function limpiar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([clave]) => !PROHIBIDAS.test(clave))
        .map(([clave, v]) => [clave, limpiar(v)]),
    );
  }
  return valor;
}

const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00-05:00`);

// Registro de auditoría: solo lectura, con filtros y sin datos que no correspondan
@Injectable()
export class AuditoriaAdminService {
  constructor(private readonly prisma: PrismaAdmin) {}

  async listar(filtros: z.infer<typeof esquemaListaAuditoria>) {
    const hoy = hoyEnLima();
    const where: Prisma.AuditoriaWhereInput = {
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.admin ? { adminId: filtros.admin } : {}),
      ...(filtros.accion ? { accion: { contains: filtros.accion, mode: 'insensitive' as const } } : {}),
      ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            creadaEn: {
              ...(filtros.desde ? { gte: inicioDelDia(filtros.desde) } : {}),
              ...(filtros.hasta ? { lt: inicioDelDia(sumarDias(filtros.hasta, 1)) } : {}),
            },
          }
        : {}),
      ...(filtros.q
        ? {
            OR: [
              { motivo: { contains: filtros.q, mode: 'insensitive' as const } },
              { accion: { contains: filtros.q, mode: 'insensitive' as const } },
              { admin: { nombre: { contains: filtros.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [total, filas, totalGeneral, semana, porTipo, administradores] = await Promise.all([
      this.prisma.auditoria.count({ where }),
      this.prisma.auditoria.findMany({
        where,
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          creadaEn: true,
          tipo: true,
          accion: true,
          entidad: true,
          entidadId: true,
          motivo: true,
          antes: true,
          despues: true,
          admin: { select: { id: true, nombre: true } },
        },
      }),
      this.prisma.auditoria.count(),
      this.prisma.auditoria.count({ where: { creadaEn: { gte: inicioDelDia(sumarDias(hoy, -6)) } } }),
      this.prisma.auditoria.groupBy({ by: ['tipo'], _count: { _all: true } }),
      this.prisma.usuario.findMany({
        where: { rol: 'ADMIN' },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);
    return {
      resumen: {
        total: totalGeneral,
        ultimos7Dias: semana,
        tipos: Object.fromEntries(porTipo.map((t) => [t.tipo, t._count._all])),
      },
      administradores,
      total,
      pagina: filtros.pagina,
      porPagina: POR_PAGINA,
      datos: filas.map((f) => ({
        id: f.id.toString(),
        cuando: f.creadaEn,
        tipo: f.tipo,
        administrador: f.admin,
        accion: f.accion,
        entidad: f.entidad,
        entidadId: f.entidadId,
        motivo: f.motivo,
        antes: limpiar(f.antes),
        despues: limpiar(f.despues),
      })),
    };
  }

  // Hechos de privacidad (descargas de datos, eliminaciones, aceptaciones de textos): solo el hecho, nunca el contenido
  async privacidad(pagina = 1) {
    const [total, filas, porTipo] = await Promise.all([
      this.prisma.registroPrivacidad.count(),
      this.prisma.registroPrivacidad.findMany({
        orderBy: { id: 'desc' },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: { id: true, tipo: true, creadoEn: true, usuario: { select: { id: true, nombre: true, rol: true } } },
      }),
      this.prisma.registroPrivacidad.groupBy({ by: ['tipo'], _count: { _all: true } }),
    ]);
    return {
      resumen: Object.fromEntries(porTipo.map((t) => [t.tipo, t._count._all])),
      total,
      pagina,
      porPagina: POR_PAGINA,
      datos: filas.map((f) => ({ id: f.id.toString(), cuando: f.creadoEn, tipo: f.tipo, usuario: f.usuario })),
    };
  }
}
