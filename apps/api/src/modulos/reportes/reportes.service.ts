import { Injectable } from '@nestjs/common';
import { type CodigoMaterial, TEXTO_MOTIVO_REPORTE } from '@reciclomap/shared';
import type { z } from 'zod';
import type { esquemaReporteNegocio } from '@reciclomap/shared';
import type { ReporteEstado } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { esViolacionUnica } from '../publicaciones/publicaciones.repositorio.js';

type DatosReporte = z.infer<typeof esquemaReporteNegocio>;
export type FiltroReportesNegocio = 'todos' | 'correccion' | 'revision' | 'resueltos';

const ESTADOS_NEGOCIO: Record<FiltroReportesNegocio, ReporteEstado[] | null> = {
  todos: null,
  correccion: ['CORRECCION_PEDIDA'],
  revision: ['PENDIENTE', 'EN_REVISION'],
  resueltos: ['RESUELTO', 'DESCARTADO'],
};

// Qué hacer ante cada motivo cuando la administración pide corregir
const QUE_HACER: Record<string, { texto: string; enlace: string }> = {
  PRECIO: { texto: 'Actualiza el precio en Precios y demanda.', enlace: '/negocio/precios' },
  CERRADO: { texto: 'Revisa tu horario de atención.', enlace: '/negocio/datos' },
  UBICACION: { texto: 'Solicita el cambio de dirección o pin.', enlace: '/negocio/datos' },
  FALSA: { texto: 'Revisa los datos de tu negocio.', enlace: '/negocio/datos' },
  OTRO: { texto: 'Revisa los datos de tu negocio.', enlace: '/negocio/datos' },
};

// Pantallas 16 y 49: quien reporta queda en reserva; el negocio ve el motivo y el estado, nunca al autor
@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async reportarNegocio(usuario: UsuarioSesion, datos: DatosReporte) {
    const negocio = await this.prisma.comprador.findFirst({
      where: { id: datos.compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
      select: { id: true, nombreComercial: true },
    });
    if (!negocio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio en el mapa.', 404);
    await this.exigirDentroDelLimite(usuario, negocio.id);
    const material = datos.material
      ? await this.prisma.material.findUnique({ where: { codigo: datos.material }, select: { id: true } })
      : null;
    try {
      const reporte = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.reporte.create({
          data: {
            tipo: 'NEGOCIO',
            autorId: usuario.id,
            compradorId: negocio.id,
            materialId: material?.id ?? null,
            motivo: datos.motivo,
            precioVisto: datos.motivo === 'PRECIO' ? (datos.precioVisto ?? null) : null,
            detalle: datos.detalle || null,
          },
          select: { id: true, creadoEn: true },
        });
        const admins = await tx.usuario.findMany({ where: { rol: 'ADMIN', estado: 'ACTIVO' }, select: { id: true } });
        for (const admin of admins) {
          await this.notificaciones.crear(tx, {
            usuarioId: admin.id,
            tipo: 'AVISO',
            titulo: `Nuevo reporte: ${TEXTO_MOTIVO_REPORTE[datos.motivo]}`,
            mensaje: `Sobre ${negocio.nombreComercial}. Revísalo en Reportes de usuarios.`,
            enlace: '/admin/reportes',
            obligatoria: true,
          });
        }
        return creado;
      });
      return { id: reporte.id, negocio: negocio.nombreComercial, estado: 'PENDIENTE' };
    } catch (error) {
      if (esViolacionUnica(error)) {
        throw new ErrorNegocio(
          'YA_REPORTADO',
          'Ya enviaste un reporte por este motivo sobre este negocio. Un administrador lo está revisando.',
          409,
        );
      }
      throw error;
    }
  }

  // Contra reportes masivos: pocos abiertos a la vez y pocos sobre un mismo negocio en un día
  private async exigirDentroDelLimite(usuario: UsuarioSesion, compradorId: string): Promise<void> {
    const parametro = async (clave: string, defecto: number) => {
      const fila = await this.prisma.parametro.findUnique({ where: { clave }, select: { valor: true } });
      const valor = Number(fila?.valor);
      return Number.isFinite(valor) && valor > 0 ? valor : defecto;
    };
    const [maxAbiertos, maxPorNegocio] = await Promise.all([
      parametro('reportes_max_abiertos_reciclador', 5),
      parametro('reportes_max_por_negocio_24h', 2),
    ]);
    const [abiertos, delNegocio] = await Promise.all([
      this.prisma.reporte.count({
        where: {
          tipo: 'NEGOCIO',
          autorId: usuario.id,
          estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] },
        },
      }),
      this.prisma.reporte.count({
        where: {
          tipo: 'NEGOCIO',
          autorId: usuario.id,
          compradorId,
          creadoEn: { gte: new Date(Date.now() - 86_400_000) },
        },
      }),
    ]);
    if (abiertos >= maxAbiertos) {
      throw new ErrorNegocio(
        'LIMITE_REPORTES',
        `Ya tienes ${maxAbiertos} reportes en revisión. Espera a que la administración los revise para enviar otro.`,
        429,
      );
    }
    if (delNegocio >= maxPorNegocio) {
      throw new ErrorNegocio(
        'LIMITE_REPORTES_NEGOCIO',
        'Ya reportaste a este negocio hoy. Un administrador lo está revisando.',
        429,
      );
    }
  }

  async misReportes(usuario: UsuarioSesion) {
    const filas = await this.prisma.reporte.findMany({
      where: { tipo: 'NEGOCIO', autorId: usuario.id },
      orderBy: { creadoEn: 'desc' },
      take: 20,
      select: {
        id: true,
        motivo: true,
        estado: true,
        creadoEn: true,
        comprador: { select: { nombreComercial: true } },
        material: { select: { codigo: true, nombre: true } },
      },
    });
    return {
      datos: filas.map((fila) => ({
        id: fila.id,
        motivo: fila.motivo,
        estado: fila.estado,
        creadoEn: fila.creadoEn.toISOString(),
        negocio: fila.comprador?.nombreComercial ?? '',
        material: fila.material as { codigo: CodigoMaterial; nombre: string } | null,
      })),
    };
  }

  // Pantalla 49: sin autor; si hay un pedido de corrección, el plazo y qué hacer
  async deMiNegocio(usuario: UsuarioSesion, filtro: FiltroReportesNegocio) {
    const compradorId = this.negocio(usuario);
    const todas = await this.prisma.reporte.findMany({
      where: { tipo: 'NEGOCIO', compradorId },
      orderBy: { creadoEn: 'desc' },
      take: 100,
      select: {
        id: true,
        motivo: true,
        estado: true,
        detalle: true,
        decision: true,
        plazoHasta: true,
        creadoEn: true,
        material: { select: { codigo: true, nombre: true } },
      },
    });
    const estados = ESTADOS_NEGOCIO[filtro];
    const cuenta = (lista: ReporteEstado[] | null) =>
      todas.filter((fila) => !lista || lista.includes(fila.estado)).length;
    return {
      conteos: {
        todos: todas.length,
        correccion: cuenta(ESTADOS_NEGOCIO.correccion),
        revision: cuenta(ESTADOS_NEGOCIO.revision),
        resueltos: cuenta(ESTADOS_NEGOCIO.resueltos),
      },
      datos: todas
        .filter((fila) => !estados || estados.includes(fila.estado))
        .map((fila) => ({
          id: fila.id,
          motivo: fila.motivo,
          estado: fila.estado,
          detalle: fila.detalle,
          material: fila.material as { codigo: CodigoMaterial; nombre: string } | null,
          creadoEn: fila.creadoEn.toISOString(),
          correccion:
            fila.estado === 'CORRECCION_PEDIDA'
              ? {
                  motivo: fila.decision,
                  plazoHasta: fila.plazoHasta?.toISOString() ?? null,
                  ...(QUE_HACER[fila.motivo] ?? QUE_HACER.OTRO!),
                }
              : null,
          // El cierre se explica al negocio solo con la decisión, sin datos de quien reportó
          decision: fila.estado === 'RESUELTO' || fila.estado === 'DESCARTADO' ? fila.decision : null,
        })),
    };
  }

  // "Ya lo corregí": vuelve a revisión del administrador, que decide si cierra
  async marcarCorregido(usuario: UsuarioSesion, reporteId: string) {
    const compradorId = this.negocio(usuario);
    await this.prisma.$transaction(async (tx) => {
      const reporte = await tx.reporte.findFirst({
        where: { id: reporteId, tipo: 'NEGOCIO', compradorId },
        select: { estado: true, motivo: true, comprador: { select: { nombreComercial: true } } },
      });
      if (!reporte) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese reporte.', 404);
      if (reporte.estado !== 'CORRECCION_PEDIDA') {
        throw new ErrorNegocio('SIN_CORRECCION_PEDIDA', 'Este reporte no tiene un pedido de corrección abierto.', 409);
      }
      await tx.reporte.update({ where: { id: reporteId }, data: { estado: 'EN_REVISION' } });
      const admins = await tx.usuario.findMany({ where: { rol: 'ADMIN', estado: 'ACTIVO' }, select: { id: true } });
      for (const admin of admins) {
        await this.notificaciones.crear(tx, {
          usuarioId: admin.id,
          tipo: 'AVISO',
          titulo: 'Un negocio dice que ya corrigió',
          mensaje: `${reporte.comprador?.nombreComercial ?? 'Un negocio'} marcó como corregido: ${TEXTO_MOTIVO_REPORTE[reporte.motivo]}.`,
          enlace: '/admin/reportes',
          obligatoria: true,
        });
      }
    });
    return this.deMiNegocio(usuario, 'todos');
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
