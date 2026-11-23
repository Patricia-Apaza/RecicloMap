import { Injectable } from '@nestjs/common';
import type { esquemaListaAvisosAdmin, esquemaModerarAviso } from '@reciclomap/shared';
import type { z } from 'zod';
import type { Prisma } from '../../generado/prisma/client.js';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

const POR_PAGINA = 20;
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

// Moderación de avisos: se oculta con motivo y se restituye; la administración nunca los edita
@Injectable()
export class AvisosAdminService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async listar(filtros: z.infer<typeof esquemaListaAvisosAdmin>) {
    const hoy = hoyEnLima();
    const where: Prisma.AvisoWhereInput = {
      ...(filtros.estado === 'activos'
        ? { estado: 'ACTIVO', retiradoEn: null, vigenteHasta: { gte: dia(hoy) } }
        : filtros.estado === 'ocultos'
          ? { estado: 'OCULTO' }
          : {}),
      ...(filtros.q
        ? {
            OR: [
              { titulo: { contains: filtros.q, mode: 'insensitive' as const } },
              { comprador: { nombreComercial: { contains: filtros.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [total, filas, activos, ocultos] = await Promise.all([
      this.prisma.aviso.count({ where }),
      this.prisma.aviso.findMany({
        where,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        include: {
          comprador: { select: { id: true, nombreComercial: true, tipo: true } },
          ocultoPor: { select: { nombre: true } },
        },
      }),
      this.prisma.aviso.count({ where: { estado: 'ACTIVO', retiradoEn: null, vigenteHasta: { gte: dia(hoy) } } }),
      this.prisma.aviso.count({ where: { estado: 'OCULTO' } }),
    ]);
    return {
      resumen: { activos, ocultos },
      total,
      pagina: filtros.pagina,
      porPagina: POR_PAGINA,
      datos: filas.map((a) => ({
        id: a.id,
        negocio: { id: a.comprador.id, nombre: a.comprador.nombreComercial, tipo: a.comprador.tipo },
        tipo: a.tipo,
        titulo: a.titulo,
        mensaje: a.mensaje,
        vigenteHasta: a.vigenteHasta.toISOString().slice(0, 10),
        creadoEn: a.creadoEn,
        retirado: a.retiradoEn !== null,
        estado: a.estado,
        vigente: a.estado === 'ACTIVO' && a.retiradoEn === null && a.vigenteHasta.toISOString().slice(0, 10) >= hoy,
        motivoOculto: a.motivoOculto,
        ocultoEn: a.ocultoEn,
        ocultoPor: a.ocultoPor?.nombre ?? null,
      })),
    };
  }

  private async cargar(tx: PrismaAdmin | Prisma.TransactionClient, id: string) {
    const aviso = await tx.aviso.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        estado: true,
        retiradoEn: true,
        vigenteHasta: true,
        comprador: { select: { id: true, usuarioId: true, nombreComercial: true } },
      },
    });
    if (!aviso) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese aviso.', 404);
    return aviso;
  }

  async ocultar(adminId: string, id: string, datos: z.infer<typeof esquemaModerarAviso>) {
    await this.prisma.$transaction(async (tx) => {
      const aviso = await this.cargar(tx, id);
      if (aviso.estado !== 'ACTIVO') throw new ErrorNegocio('AVISO_YA_OCULTO', 'Ese aviso ya está oculto.', 409);
      await tx.aviso.update({
        where: { id },
        data: { estado: 'OCULTO', motivoOculto: datos.motivo, ocultoPorId: adminId, ocultoEn: new Date() },
      });
      await auditar(tx, {
        adminId,
        tipo: 'AVISOS',
        accion: 'OCULTAR',
        entidad: 'aviso',
        entidadId: id,
        motivo: datos.motivo,
        antes: { estado: 'ACTIVO' },
        despues: { estado: 'OCULTO', negocio: aviso.comprador.nombreComercial, titulo: aviso.titulo },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: aviso.comprador.usuarioId,
        tipo: 'CUENTA',
        titulo: `Ocultamos tu aviso «${aviso.titulo}»`,
        mensaje: `Motivo: ${datos.motivo}. Puedes crear uno nuevo sin precios, teléfonos ni enlaces.`,
        enlace: '/negocio/plan',
        obligatoria: true,
      });
    });
    return (await this.listar({ estado: 'todos', pagina: 1 })).datos.find((a) => a.id === id);
  }

  async restituir(adminId: string, id: string, datos: z.infer<typeof esquemaModerarAviso>) {
    await this.prisma.$transaction(async (tx) => {
      const aviso = await this.cargar(tx, id);
      if (aviso.estado !== 'OCULTO') throw new ErrorNegocio('AVISO_NO_OCULTO', 'Ese aviso no está oculto.', 409);
      if (aviso.retiradoEn || aviso.vigenteHasta.toISOString().slice(0, 10) < hoyEnLima()) {
        throw new ErrorNegocio('AVISO_VENCIDO', 'Ese aviso ya venció o lo retiró el negocio.', 409);
      }
      const limite = await tx.parametro.findUnique({ where: { clave: 'aviso_max_activos' }, select: { valor: true } });
      const maximo = Number(limite?.valor) > 0 ? Number(limite?.valor) : 3;
      const activos = await tx.aviso.count({
        where: {
          compradorId: aviso.comprador.id,
          estado: 'ACTIVO',
          retiradoEn: null,
          vigenteHasta: { gte: dia(hoyEnLima()) },
        },
      });
      if (activos >= maximo) {
        throw new ErrorNegocio('LIMITE_AVISOS', 'El negocio ya tiene el máximo de avisos activos.', 409);
      }
      await tx.aviso.update({
        where: { id },
        data: { estado: 'ACTIVO', motivoOculto: null, ocultoPorId: null, ocultoEn: null },
      });
      await auditar(tx, {
        adminId,
        tipo: 'AVISOS',
        accion: 'RESTITUIR',
        entidad: 'aviso',
        entidadId: id,
        motivo: datos.motivo,
        antes: { estado: 'OCULTO' },
        despues: { estado: 'ACTIVO', negocio: aviso.comprador.nombreComercial, titulo: aviso.titulo },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: aviso.comprador.usuarioId,
        tipo: 'CUENTA',
        titulo: `Restituimos tu aviso «${aviso.titulo}»`,
        mensaje: 'Vuelve a verse en tu ficha.',
        enlace: '/negocio/plan',
        obligatoria: true,
      });
    });
    return (await this.listar({ estado: 'todos', pagina: 1 })).datos.find((a) => a.id === id) ?? { id };
  }
}
