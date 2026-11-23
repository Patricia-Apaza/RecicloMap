import { Injectable } from '@nestjs/common';
import type { esquemaListaUsuarios, esquemaReactivar, esquemaSuspender } from '@reciclomap/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generado/prisma/client.js';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { EfectosSuspensionService } from './efectos-suspension.service.js';

const POR_PAGINA = 20;
const ENCURSO = ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'] as const;
type Filtros = z.infer<typeof esquemaListaUsuarios>;

const donde = (f: Filtros): Prisma.UsuarioWhereInput => {
  const situacion: Prisma.UsuarioWhereInput =
    f.situacion === 'activas'
      ? { estado: 'ACTIVO' }
      : f.situacion === 'suspendidas'
        ? { estado: 'SUSPENDIDO' }
        : f.situacion === 'pendientes'
          ? { estado: { in: ['PENDIENTE_TELEFONO', 'REGISTRO_INCOMPLETO'] } }
          : { estado: { not: 'ELIMINADO' } };
  const digitos = f.q?.replace(/\D/g, '');
  return {
    ...situacion,
    ...(f.rol !== 'todos' ? { rol: f.rol } : {}),
    ...(f.ciudad ? { ciudadId: f.ciudad } : {}),
    ...(f.q
      ? {
          OR: [
            { nombre: { contains: f.q, mode: 'insensitive' as const } },
            { correo: { contains: f.q, mode: 'insensitive' as const } },
            { comprador: { nombreComercial: { contains: f.q, mode: 'insensitive' as const } } },
            ...(digitos && digitos.length >= 3 ? [{ telefono: { contains: digitos } }] : []),
          ],
        }
      : {}),
  };
};

// Gestión de cuentas: la administración mira y suspende o reactiva con motivo. Nunca edita datos ni muestra ubicación ni contraseña
@Injectable()
export class UsuariosAdminService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
    private readonly efectos: EfectosSuspensionService,
  ) {}

  async listar(filtros: Filtros) {
    const where = donde(filtros);
    const [total, filas, activos, suspendidos, pendientes, todos, ciudades] = await Promise.all([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          nombre: true,
          rol: true,
          estado: true,
          motivoSuspension: true,
          creadoEn: true,
          ciudad: { select: { id: true, nombre: true } },
          perfilReciclador: { select: { operacionesCompletadas: true, kgTotal: true } },
          comprador: {
            select: { nombreComercial: true, tipo: true, plan: true, califCant: true, estadoVerificacion: true },
          },
        },
      }),
      this.prisma.usuario.count({ where: { estado: 'ACTIVO' } }),
      this.prisma.usuario.count({ where: { estado: 'SUSPENDIDO' } }),
      this.prisma.usuario.count({ where: { estado: { in: ['PENDIENTE_TELEFONO', 'REGISTRO_INCOMPLETO'] } } }),
      this.prisma.usuario.count({ where: { estado: { not: 'ELIMINADO' } } }),
      this.prisma.ciudad.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    ]);
    return {
      resumen: { total: todos, activos, suspendidos, pendientes },
      ciudades,
      total,
      pagina: filtros.pagina,
      porPagina: POR_PAGINA,
      datos: filas.map((u) => ({
        id: u.id,
        nombre: u.comprador?.nombreComercial ?? u.nombre,
        rol: u.rol,
        estado: u.estado,
        motivoSuspension: u.motivoSuspension,
        creadoEn: u.creadoEn,
        ciudad: u.ciudad,
        actividad: u.perfilReciclador
          ? `${u.perfilReciclador.operacionesCompletadas} operaciones · ${Number(u.perfilReciclador.kgTotal)} kg`
          : u.comprador
            ? `${u.comprador.califCant} reseñas${u.comprador.plan === 'PRO' ? ' · Pro' : ''}`
            : null,
      })),
    };
  }

  // Ficha: solo lo necesario para decidir; sin ubicación, sin contraseña, sin códigos ni sesiones
  async ficha(id: string) {
    const u = await this.prisma.usuario.findFirst({
      where: { id, estado: { not: 'ELIMINADO' } },
      select: {
        id: true,
        rol: true,
        nombre: true,
        correo: true,
        telefono: true,
        estado: true,
        motivoSuspension: true,
        suspendidoEn: true,
        creadoEn: true,
        ciudad: { select: { id: true, nombre: true } },
        suspendidoPor: { select: { nombre: true } },
        perfilReciclador: { select: { operacionesCompletadas: true, kgTotal: true, califProm: true, califCant: true } },
        comprador: {
          select: {
            id: true,
            nombreComercial: true,
            tipo: true,
            plan: true,
            estadoVerificacion: true,
            califProm: true,
            califCant: true,
          },
        },
      },
    });
    if (!u) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa cuenta.', 404);
    const compradorId = u.comprador?.id;
    const [publicaciones, ofertasPendientes, operaciones, reportes, enCurso, historial] = await Promise.all([
      this.prisma.publicacion.count({ where: { recicladorId: id, estado: { in: ['DISPONIBLE', 'CON_OFERTAS'] } } }),
      this.prisma.oferta.count({
        where: {
          estado: 'PENDIENTE',
          OR: [...(compradorId ? [{ compradorId }] : []), { publicacion: { recicladorId: id } }],
        },
      }),
      this.prisma.operacion.groupBy({
        by: ['estado'],
        where: { OR: [{ recicladorId: id }, ...(compradorId ? [{ compradorId }] : [])] },
        _count: { _all: true },
      }),
      this.prisma.reporte.count({
        where: {
          OR: [{ autorId: id }, ...(compradorId ? [{ compradorId }] : [])],
          estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] },
        },
      }),
      this.prisma.operacion.findMany({
        where: {
          estado: { in: [...ENCURSO] },
          OR: [{ recicladorId: id }, ...(compradorId ? [{ compradorId }] : [])],
        },
        orderBy: { creadaEn: 'asc' },
        take: 20,
        select: {
          id: true,
          estado: true,
          creadaEn: true,
          publicacion: { select: { cantidadKg: true, material: { select: { nombre: true } } } },
          reciclador: { select: { nombre: true } },
          comprador: { select: { nombreComercial: true } },
          recicladorId: true,
        },
      }),
      this.prisma.auditoria.findMany({
        where: { tipo: 'USUARIOS', entidad: 'usuario', entidadId: id },
        orderBy: { creadaEn: 'desc' },
        take: 10,
        select: { accion: true, motivo: true, creadaEn: true, admin: { select: { nombre: true } } },
      }),
    ]);
    const cuenta = (e: string) => operaciones.find((o) => o.estado === e)?._count._all ?? 0;
    return {
      id: u.id,
      rol: u.rol,
      nombre: u.nombre,
      nombreComercial: u.comprador?.nombreComercial ?? null,
      correo: u.correo,
      telefono: u.telefono,
      ciudad: u.ciudad,
      estado: u.estado,
      motivoSuspension: u.motivoSuspension,
      suspendidoEn: u.suspendidoEn,
      suspendidoPor: u.suspendidoPor?.nombre ?? null,
      creadoEn: u.creadoEn,
      negocio: u.comprador
        ? { tipo: u.comprador.tipo, plan: u.comprador.plan, verificacion: u.comprador.estadoVerificacion }
        : null,
      actividad: {
        operacionesCompletadas: cuenta('COMPLETADA'),
        operacionesCanceladas: cuenta('CANCELADA'),
        operacionesEnCurso: enCurso.length,
        kgTotal: u.perfilReciclador ? Number(u.perfilReciclador.kgTotal) : null,
        calificacion: u.perfilReciclador?.califCant
          ? { promedio: Number(u.perfilReciclador.califProm), cantidad: u.perfilReciclador.califCant }
          : u.comprador?.califCant
            ? { promedio: Number(u.comprador.califProm), cantidad: u.comprador.califCant }
            : null,
        publicacionesAbiertas: publicaciones,
        ofertasPendientes,
        reportesAbiertos: reportes,
      },
      operacionesEnCurso: enCurso.map((o) => ({
        id: o.id,
        estado: o.estado,
        desde: o.creadaEn,
        material: o.publicacion.material.nombre,
        kg: Number(o.publicacion.cantidadKg),
        otraParte: o.recicladorId === id ? o.comprador.nombreComercial : o.reciclador.nombre,
      })),
      historialDeSituacion: historial.map((h) => ({
        accion: h.accion,
        motivo: h.motivo,
        fecha: h.creadaEn,
        administrador: h.admin.nombre,
      })),
    };
  }

  async suspender(adminId: string, id: string, datos: z.infer<typeof esquemaSuspender>) {
    if (adminId === id) throw new ErrorNegocio('CUENTA_ADMIN', 'No puedes suspender tu propia cuenta.', 409);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.findUnique({ where: { id }, select: { rol: true, estado: true, nombre: true } });
      if (!u || u.estado === 'ELIMINADO') throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa cuenta.', 404);
      if (u.rol === 'ADMIN') {
        throw new ErrorNegocio('CUENTA_ADMIN', 'Una cuenta de administración no se suspende desde esta pantalla.', 409);
      }
      if (u.estado !== 'ACTIVO') {
        throw new ErrorNegocio('CUENTA_NO_ACTIVA', 'Solo se puede suspender una cuenta activa.', 409);
      }
      await tx.usuario.update({
        where: { id },
        data: {
          estado: 'SUSPENDIDO',
          motivoSuspension: datos.motivo,
          suspendidoEn: new Date(),
          suspendidoPorId: adminId,
        },
      });
      await auditar(tx, {
        adminId,
        tipo: 'USUARIOS',
        accion: 'SUSPENDER',
        entidad: 'usuario',
        entidadId: id,
        motivo: `${datos.motivo}: ${datos.nota}`,
        antes: { estado: 'ACTIVO' },
        despues: { estado: 'SUSPENDIDO', cuenta: u.nombre },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: id,
        tipo: 'CUENTA',
        titulo: 'Tu cuenta fue suspendida',
        mensaje: `Motivo: ${datos.motivo}. Puedes consultar tu historial, pero no publicar ni ofertar. Si crees que es un error, escríbenos a soporte.`,
        obligatoria: true,
      });
    });
    const efectos = await this.efectos.aplicar(id);
    return { ...(await this.ficha(id)), efectos };
  }

  async reactivar(adminId: string, id: string, datos: z.infer<typeof esquemaReactivar>) {
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.usuario.findUnique({ where: { id }, select: { estado: true, nombre: true } });
      if (!u) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa cuenta.', 404);
      if (u.estado !== 'SUSPENDIDO') {
        throw new ErrorNegocio('CUENTA_NO_SUSPENDIDA', 'Esa cuenta no está suspendida.', 409);
      }
      await tx.usuario.update({
        where: { id },
        data: { estado: 'ACTIVO', motivoSuspension: null, suspendidoEn: null, suspendidoPorId: null },
      });
      await auditar(tx, {
        adminId,
        tipo: 'USUARIOS',
        accion: 'REACTIVAR',
        entidad: 'usuario',
        entidadId: id,
        motivo: datos.motivo,
        antes: { estado: 'SUSPENDIDO' },
        despues: { estado: 'ACTIVO', cuenta: u.nombre },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: id,
        tipo: 'CUENTA',
        titulo: 'Tu cuenta fue reactivada',
        mensaje: 'Ya puedes publicar y ofertar otra vez. Tus publicaciones abiertas vuelven a verse.',
        obligatoria: true,
      });
    });
    return this.ficha(id);
  }
}
