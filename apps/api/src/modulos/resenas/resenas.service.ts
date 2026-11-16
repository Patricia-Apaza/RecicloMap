import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generado/prisma/client.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { esViolacionUnica } from '../publicaciones/publicaciones.repositorio.js';
import { nombreCorto } from '../publicaciones/textos.js';
import { calificacionPublica } from '../publicaciones/vistas.js';

export type FiltroResenas = 'todas' | 'sin-responder' | 'bajas';

const seleccionResena = {
  id: true,
  estrellas: true,
  comentario: true,
  creadaEn: true,
  autor: { select: { nombre: true } },
  etiquetas: { select: { etiqueta: { select: { nombre: true } } } },
  respuesta: { select: { texto: true, creadaEn: true } },
} satisfies Prisma.CalificacionSelect;

type FilaResena = Prisma.CalificacionGetPayload<{ select: typeof seleccionResena }>;

// Reseñas al negocio: públicas, con el autor como "Nombre I."; el negocio responde una sola vez (17 y 48)
@Injectable()
export class ResenasService {
  constructor(private readonly prisma: PrismaApi) {}

  async publicas(compradorId: string) {
    const negocio = await this.prisma.comprador.findFirst({
      where: { id: compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
      select: { nombreComercial: true, usuarioId: true, califProm: true, califCant: true },
    });
    if (!negocio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio.', 404);
    const resenas = await this.prisma.calificacion.findMany({
      where: { destinoId: negocio.usuarioId, oculta: null },
      orderBy: { creadaEn: 'desc' },
      take: 50,
      select: seleccionResena,
    });
    return {
      negocio: negocio.nombreComercial,
      resumen: await this.resumen(negocio.usuarioId, negocio.califProm, negocio.califCant),
      datos: resenas.map((r) => this.vista(r)),
    };
  }

  async recibidas(usuario: UsuarioSesion, filtro: FiltroResenas) {
    const negocio = await this.prisma.comprador.findUnique({
      where: { id: this.negocio(usuario) },
      select: { usuarioId: true, califProm: true, califCant: true },
    });
    if (!negocio) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    const donde: Prisma.CalificacionWhereInput = {
      destinoId: negocio.usuarioId,
      oculta: null,
      ...(filtro === 'sin-responder' ? { respuesta: null } : {}),
      ...(filtro === 'bajas' ? { estrellas: { lte: 3 } } : {}),
    };
    const resenas = await this.prisma.calificacion.findMany({
      where: donde,
      orderBy: { creadaEn: 'desc' },
      take: 100,
      select: seleccionResena,
    });
    const reportadas = await this.prisma.reporte.findMany({
      where: { tipo: 'RESENA', autorId: usuario.id, calificacionId: { in: resenas.map((r) => r.id) } },
      select: { calificacionId: true },
    });
    const yaReportadas = new Set(reportadas.map((r) => r.calificacionId));
    return {
      resumen: await this.resumen(negocio.usuarioId, negocio.califProm, negocio.califCant),
      datos: resenas.map((r) => ({ ...this.vista(r), reportadaPorMi: yaReportadas.has(r.id) })),
    };
  }

  async responder(usuario: UsuarioSesion, calificacionId: string, texto: string) {
    const resena = await this.prisma.calificacion.findUnique({
      where: { id: calificacionId },
      select: { destinoId: true },
    });
    if (!resena || resena.destinoId !== usuario.id || !usuario.compradorId) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa reseña.', 404);
    }
    try {
      await this.prisma.respuestaCalificacion.create({ data: { calificacionId, texto } });
    } catch (error) {
      if (esViolacionUnica(error)) throw new ErrorNegocio('YA_RESPONDIDA', 'Ya respondiste esta reseña.', 409);
      throw error;
    }
    return this.vista(
      await this.prisma.calificacion.findUniqueOrThrow({ where: { id: calificacionId }, select: seleccionResena }),
    );
  }

  // Cualquier reseña se puede reportar; la moderación llega en la Fase 8
  async reportar(usuario: UsuarioSesion, calificacionId: string, detalle: string | null) {
    const resena = await this.prisma.calificacion.findUnique({
      where: { id: calificacionId },
      select: { autorId: true, destinoId: true },
    });
    if (!resena) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa reseña.', 404);
    if (resena.autorId === usuario.id) {
      throw new ErrorNegocio('RESENA_PROPIA', 'No puedes reportar tu propia reseña.', 422);
    }
    const previo = await this.prisma.reporte.count({
      where: { tipo: 'RESENA', autorId: usuario.id, calificacionId },
    });
    if (previo > 0)
      throw new ErrorNegocio('YA_REPORTADA', 'Ya reportaste esta reseña. Un administrador la revisará.', 409);
    await this.prisma.reporte.create({
      data: {
        tipo: 'RESENA',
        autorId: usuario.id,
        calificacionId,
        motivo: 'RESENA_INAPROPIADA',
        detalle: detalle || null,
      },
    });
    return { reportada: true };
  }

  // Reseñas al reciclador: las ve él mismo, los negocios verificados y el administrador; el autor es el negocio
  async delReciclador(recicladorId: string) {
    const perfil = await this.prisma.recicladorPerfil.findUnique({
      where: { usuarioId: recicladorId },
      select: { califProm: true, califCant: true },
    });
    if (!perfil) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos a ese reciclador.', 404);
    const resenas = await this.prisma.calificacion.findMany({
      where: { destinoId: recicladorId, oculta: null },
      orderBy: { creadaEn: 'desc' },
      take: 50,
      select: {
        id: true,
        estrellas: true,
        comentario: true,
        creadaEn: true,
        autor: { select: { nombre: true, comprador: { select: { nombreComercial: true } } } },
        etiquetas: { select: { etiqueta: { select: { nombre: true } } } },
      },
    });
    return {
      resumen: await this.resumen(recicladorId, perfil.califProm, perfil.califCant),
      datos: resenas.map((r) => ({
        id: r.id,
        autor: r.autor.comprador?.nombreComercial ?? nombreCorto(r.autor.nombre),
        estrellas: r.estrellas,
        comentario: r.comentario,
        etiquetas: r.etiquetas.map((e) => e.etiqueta.nombre),
        creadaEn: r.creadaEn.toISOString(),
        respuesta: null,
      })),
    };
  }

  private async resumen(destinoId: string, promedio: Prisma.Decimal, cantidad: number) {
    const grupos = await this.prisma.calificacion.groupBy({
      by: ['estrellas'],
      where: { destinoId, oculta: null },
      _count: { _all: true },
    });
    const distribucion = [5, 4, 3, 2, 1].map((estrellas) => ({
      estrellas,
      cantidad: grupos.find((g) => g.estrellas === estrellas)?._count._all ?? 0,
    }));
    return { ...calificacionPublica(promedio, cantidad), distribucion };
  }

  private vista(r: FilaResena) {
    return {
      id: r.id,
      autor: nombreCorto(r.autor.nombre),
      estrellas: r.estrellas,
      comentario: r.comentario,
      etiquetas: r.etiquetas.map((e) => e.etiqueta.nombre),
      creadaEn: r.creadaEn.toISOString(),
      respuesta: r.respuesta ? { texto: r.respuesta.texto, creadaEn: r.respuesta.creadaEn.toISOString() } : null,
    };
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
