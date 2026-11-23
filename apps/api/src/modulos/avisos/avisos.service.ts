import { Injectable } from '@nestjs/common';
import type { esquemaAviso, TipoAviso } from '@reciclomap/shared';
import type { z } from 'zod';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { hoyEnLima, sumarDias } from '../estadisticas/fechas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

const POR_PAGINA = 20;
const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

// Avisos informativos del negocio. Los límites son parámetros de la administración e iguales para Gratis y Pro
@Injectable()
export class AvisosService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async parametro(clave: string, defecto: number): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave }, select: { valor: true } });
    const valor = Number(fila?.valor);
    return Number.isFinite(valor) && valor > 0 ? valor : defecto;
  }

  async limites() {
    const [maxActivos, vigenciaMaxDias] = await Promise.all([
      this.parametro('aviso_max_activos', 3),
      this.parametro('aviso_vigencia_max_dias', 14),
    ]);
    return { maxActivos, vigenciaMaxDias };
  }

  async misAvisos(usuario: UsuarioSesion) {
    const compradorId = this.negocio(usuario);
    const hoy = hoyEnLima();
    const [filas, limites] = await Promise.all([
      this.prisma.aviso.findMany({
        where: { compradorId, retiradoEn: null },
        orderBy: { creadoEn: 'desc' },
        take: 30,
        select: {
          id: true,
          tipo: true,
          titulo: true,
          mensaje: true,
          vigenteHasta: true,
          creadoEn: true,
          estado: true,
          motivoOculto: true,
        },
      }),
      this.limites(),
    ]);
    const vista = filas.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      mensaje: a.mensaje,
      vigenteHasta: a.vigenteHasta.toISOString().slice(0, 10),
      creadoEn: a.creadoEn.toISOString(),
      vigente: a.estado === 'ACTIVO' && a.vigenteHasta.toISOString().slice(0, 10) >= hoy,
      // Lo oculta la administración con un motivo que el negocio puede leer
      oculto: a.estado === 'OCULTO',
      motivoOculto: a.estado === 'OCULTO' ? a.motivoOculto : null,
    }));
    return { limites: { ...limites, activos: vista.filter((a) => a.vigente).length }, datos: vista };
  }

  async publicar(usuario: UsuarioSesion, datos: z.infer<typeof esquemaAviso>) {
    const compradorId = this.negocio(usuario);
    const limites = await this.limites();
    if (datos.vigenciaDias > limites.vigenciaMaxDias) {
      throw new ErrorNegocio('VIGENCIA_EXCESIVA', `Un aviso dura como máximo ${limites.vigenciaMaxDias} días.`, 422, [
        { campo: 'vigenciaDias', mensaje: `Máximo ${limites.vigenciaMaxDias} días.` },
      ]);
    }
    const hoy = hoyEnLima();
    const aviso = await this.prisma.$transaction(async (tx) => {
      // Serializa los avisos de un mismo negocio: dos publicaciones a la vez no superan el límite
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`avisos:${compradorId}`}))`;
      const activos = await tx.aviso.count({
        where: { compradorId, retiradoEn: null, estado: 'ACTIVO', vigenteHasta: { gte: dia(hoy) } },
      });
      if (activos >= limites.maxActivos) {
        throw new ErrorNegocio(
          'LIMITE_AVISOS',
          `Ya tienes ${limites.maxActivos} avisos activos. Quita uno o espera a que venza para publicar otro.`,
          409,
        );
      }
      const creado = await tx.aviso.create({
        data: {
          compradorId,
          tipo: datos.tipo,
          titulo: datos.titulo,
          mensaje: datos.mensaje || null,
          vigenteHasta: dia(sumarDias(hoy, datos.vigenciaDias - 1)),
        },
        select: { id: true, titulo: true, comprador: { select: { nombreComercial: true } } },
      });
      // Solo a quienes lo guardaron en favoritos con la alerta de anuncios activada
      const seguidores = await tx.favorito.findMany({
        where: { compradorId, alertaAvisos: true },
        select: { usuarioId: true },
      });
      for (const { usuarioId } of seguidores) {
        await this.notificaciones.crear(tx, {
          usuarioId,
          tipo: 'AVISO',
          titulo: `${creado.comprador.nombreComercial}: ${creado.titulo}`.slice(0, 80),
          mensaje: (datos.mensaje || 'Tiene un anuncio nuevo en su ficha.').slice(0, 200),
          enlace: `/negocios/${compradorId}`,
        });
      }
      return creado;
    });
    return { id: aviso.id, ...(await this.misAvisos(usuario)) };
  }

  async quitar(usuario: UsuarioSesion, id: string): Promise<void> {
    const compradorId = this.negocio(usuario);
    const hecho = await this.prisma.aviso.updateMany({
      where: { id, compradorId, retiradoEn: null },
      data: { retiradoEn: new Date() },
    });
    if (hecho.count === 0) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese aviso.', 404);
  }

  // Ficha del negocio: solo los vigentes de un negocio visible
  async delNegocio(compradorId: string) {
    const visible = await this.prisma.comprador.count({
      where: { id: compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
    });
    if (!visible) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio.', 404);
    const filas = await this.prisma.aviso.findMany({
      where: { ...this.vigentes(), compradorId },
      orderBy: { creadoEn: 'desc' },
      select: { id: true, tipo: true, titulo: true, mensaje: true, vigenteHasta: true, creadoEn: true },
    });
    return { datos: filas.map((a) => this.publico(a)) };
  }

  // Sección "Avisos": los vigentes de la ciudad
  async deLaCiudad(ciudadId: number | undefined, tipo: TipoAviso | undefined, pagina: number) {
    const ciudad =
      ciudadId ?? (await this.prisma.ciudad.findFirst({ where: { estado: 'ACTIVA' }, select: { id: true } }))?.id;
    const vigentes = this.vigentes();
    const donde = {
      ...vigentes,
      ...(tipo ? { tipo } : {}),
      comprador: { ...vigentes.comprador, usuario: { estado: 'ACTIVO' as const, ciudadId: ciudad } },
    };
    const [total, filas] = await Promise.all([
      this.prisma.aviso.count({ where: donde }),
      this.prisma.aviso.findMany({
        where: donde,
        orderBy: { creadoEn: 'desc' },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          tipo: true,
          titulo: true,
          mensaje: true,
          vigenteHasta: true,
          creadoEn: true,
          comprador: { select: { id: true, nombreComercial: true, tipo: true } },
        },
      }),
    ]);
    return {
      total,
      pagina,
      datos: filas.map((a) => ({
        ...this.publico(a),
        negocio: { id: a.comprador.id, nombre: a.comprador.nombreComercial, tipo: a.comprador.tipo },
      })),
    };
  }

  private vigentes() {
    return {
      retiradoEn: null,
      estado: 'ACTIVO' as const,
      vigenteHasta: { gte: dia(hoyEnLima()) },
      comprador: { estadoVerificacion: 'APROBADO' as const, usuario: { estado: 'ACTIVO' as const } },
    };
  }

  private publico(a: {
    id: string;
    tipo: TipoAviso;
    titulo: string;
    mensaje: string | null;
    vigenteHasta: Date;
    creadoEn: Date;
  }) {
    return {
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      mensaje: a.mensaje,
      vigenteHasta: a.vigenteHasta.toISOString().slice(0, 10),
      creadoEn: a.creadoEn.toISOString(),
    };
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
