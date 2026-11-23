import { Injectable } from '@nestjs/common';
import type { esquemaGuardarCatalogo, esquemaListaEntregas, esquemaReponerStock } from '@reciclomap/shared';
import type { z } from 'zod';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { numeroParametro } from '../juego/progreso.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

type Catalogo = z.infer<typeof esquemaGuardarCatalogo>;
const centesimas = (p: number) => Math.round(p * 100);
const dia = (fecha: Date | null) => (fecha ? fecha.toISOString() : null);

// Catálogo, stock, entregas y pausa de la ruleta. El administrador nunca crea premios para una persona ni agrega giros ni puntos
@Injectable()
export class PremiosAdminService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async enPausa(): Promise<boolean> {
    return (await this.prisma.parametro.findUnique({ where: { clave: 'ruleta_en_pausa' } }))?.valor === '1';
  }

  async catalogo() {
    const [premios, ganados, pausa, stockBajo] = await Promise.all([
      this.prisma.premio.findMany({ orderBy: [{ activo: 'desc' }, { orden: 'asc' }] }),
      this.prisma.sorteoRuleta.groupBy({ by: ['premioId'], _count: { _all: true } }),
      this.enPausa(),
      numeroParametro(this.prisma, 'premio_stock_bajo', 5),
    ]);
    const suma = premios.filter((p) => p.activo).reduce((s, p) => s + centesimas(Number(p.probabilidad)), 0);
    return {
      enPausa: pausa,
      stockBajo,
      sumaActivos: suma / 100,
      valido: suma === 10_000 && premios.filter((p) => p.activo && p.tipo === 'SIN_PREMIO').length === 1,
      datos: premios.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        tipo: p.tipo,
        puntos: p.puntos,
        probabilidad: Number(p.probabilidad),
        stock: p.stock,
        patrocinador: p.patrocinador,
        puntoEntrega: p.puntoEntrega,
        vigenciaCanjeDias: p.vigenciaCanjeDias,
        vigenteDesde: dia(p.vigenteDesde),
        vigenteHasta: dia(p.vigenteHasta),
        activo: p.activo,
        orden: p.orden,
        veces: ganados.find((g) => g.premioId === p.id)?._count._all ?? 0,
        stockBajo: p.activo && p.stock !== null && p.stock <= stockBajo,
      })),
    };
  }

  // Se guarda el catálogo completo o nada: las probabilidades de los premios activos suman exactamente 100 %
  async guardar(adminId: string, datos: Catalogo) {
    const enviados = new Set(datos.premios.filter((p) => p.id).map((p) => p.id));
    const omitido = (await this.prisma.premio.findMany({ select: { id: true, nombre: true } })).find(
      (p) => !enviados.has(p.id),
    );
    if (omitido) {
      throw new ErrorNegocio('PREMIO_OMITIDO', `El premio «${omitido.nombre}» no se borra: desactívalo.`, 422, [
        { campo: 'premios', mensaje: `Desactiva «${omitido.nombre}» en lugar de quitarlo.` },
      ]);
    }
    const activos = datos.premios.filter((p) => p.activo);
    const suma = activos.reduce((s, p) => s + centesimas(p.probabilidad), 0);
    const errores: Array<{ campo: string; mensaje: string }> = [];
    if (suma !== 10_000) {
      errores.push({
        campo: 'probabilidad',
        mensaje: `Los premios activos suman ${suma / 100} %. Deben sumar exactamente 100 %.`,
      });
    }
    if (activos.filter((p) => p.tipo === 'SIN_PREMIO').length !== 1) {
      errores.push({ campo: 'tipo', mensaje: 'Debe haber un solo «Sigue intentando» activo.' });
    }
    const nombres = datos.premios.map((p) => p.nombre.toLowerCase());
    if (new Set(nombres).size !== nombres.length)
      errores.push({ campo: 'nombre', mensaje: 'Dos premios no pueden tener el mismo nombre.' });
    if (errores.length > 0) {
      throw new ErrorNegocio('CATALOGO_NO_VALIDO', errores.map((e) => e.mensaje).join(' '), 422, errores);
    }
    return this.prisma.$transaction(async (tx) => {
      const actuales = await tx.premio.findMany({ include: { _count: { select: { sorteos: true } } } });
      const anterior = actuales.map((p) => ({
        nombre: p.nombre,
        probabilidad: Number(p.probabilidad),
        stock: p.stock,
        activo: p.activo,
      }));
      for (const [indice, p] of datos.premios.entries()) {
        const campos = {
          nombre: p.nombre,
          tipo: p.tipo,
          puntos: p.tipo === 'PUNTOS' ? (p.puntos ?? null) : null,
          probabilidad: p.probabilidad,
          stock: p.tipo === 'SIN_PREMIO' ? null : (p.stock ?? null),
          patrocinado: Boolean(p.patrocinador),
          patrocinador: p.patrocinador || null,
          puntoEntrega: p.tipo === 'OBJETO' ? (p.puntoEntrega ?? null) : null,
          vigenciaCanjeDias: p.tipo === 'OBJETO' ? (p.vigenciaCanjeDias ?? null) : null,
          vigenteDesde: p.vigenteDesde ? new Date(p.vigenteDesde) : null,
          vigenteHasta: p.vigenteHasta ? new Date(p.vigenteHasta) : null,
          activo: p.activo,
          orden: indice + 1,
        };
        if (p.id) {
          const actual = actuales.find((a) => a.id === p.id)!;
          if (
            actual._count.sorteos > 0 &&
            (actual.tipo !== p.tipo || actual.nombre !== p.nombre || actual.puntos !== (campos.puntos ?? null))
          ) {
            throw new ErrorNegocio(
              'PREMIO_GANADO_BLOQUEADO',
              `«${actual.nombre}» ya salió en la ruleta: no cambia de nombre, tipo ni puntos. Desactívalo y crea otro.`,
              409,
            );
          }
          await tx.premio.update({ where: { id: p.id }, data: campos });
        } else {
          await tx.premio.create({ data: campos });
        }
      }
      await auditar(tx, {
        adminId,
        tipo: 'PREMIOS',
        accion: 'CATALOGO',
        entidad: 'ruleta',
        entidadId: 'catalogo',
        motivo: datos.motivo,
        antes: { premios: anterior },
        despues: {
          premios: datos.premios.map((p) => ({
            nombre: p.nombre,
            probabilidad: p.probabilidad,
            stock: p.stock ?? null,
            activo: p.activo,
          })),
          rige: 'desde el próximo giro',
        },
      });
      const vigentes = await tx.premio.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
      await tx.ruletaConfiguracion.create({
        data: {
          publicadaPorId: adminId,
          premios: vigentes.map((x) => ({
            id: x.id,
            nombre: x.nombre,
            tipo: x.tipo,
            probabilidad: Number(x.probabilidad),
          })),
        },
      });
      return { guardados: datos.premios.length, sumaActivos: suma / 100 };
    });
  }

  async reponer(adminId: string, id: string, datos: z.infer<typeof esquemaReponerStock>) {
    return this.prisma.$transaction(async (tx) => {
      const premio = await tx.premio.findUnique({ where: { id } });
      if (!premio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese premio.', 404);
      if (premio.stock === null) throw new ErrorNegocio('SIN_LIMITE', 'Ese premio no tiene stock limitado.', 409);
      const actualizado = await tx.premio.update({ where: { id }, data: { stock: { increment: datos.cantidad } } });
      await auditar(tx, {
        adminId,
        tipo: 'PREMIOS',
        accion: 'REPONER_STOCK',
        entidad: 'premio',
        entidadId: id,
        motivo: datos.motivo,
        antes: { stock: premio.stock },
        despues: { stock: actualizado.stock, premio: premio.nombre },
      });
      return { id, stock: actualizado.stock };
    });
  }

  async entregas(filtro: z.infer<typeof esquemaListaEntregas>['estado']) {
    const aviso = await numeroParametro(this.prisma, 'premio_aviso_dias', 3);
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + aviso * 86_400_000);
    const donde =
      filtro === 'por-entregar'
        ? { estado: 'RECLAMADO' as const }
        : filtro === 'por-vencer'
          ? { estado: 'POR_RECLAMAR' as const, venceEn: { lte: limite, gt: ahora } }
          : filtro === 'entregados'
            ? { estado: 'ENTREGADO' as const }
            : { estado: 'VENCIDO' as const };
    const [filas, porEntregar, porVencer, entregados, vencidos] = await Promise.all([
      this.prisma.premioGanado.findMany({
        where: donde,
        orderBy:
          filtro === 'por-entregar'
            ? { reclamadoEn: 'asc' }
            : filtro === 'por-vencer'
              ? { venceEn: 'asc' }
              : { creadoEn: 'desc' },
        take: 50,
        include: { premio: { select: { nombre: true, patrocinado: true } }, usuario: { select: { nombre: true } } },
      }),
      this.prisma.premioGanado.count({ where: { estado: 'RECLAMADO' } }),
      this.prisma.premioGanado.count({ where: { estado: 'POR_RECLAMAR', venceEn: { lte: limite, gt: ahora } } }),
      this.prisma.premioGanado.count({ where: { estado: 'ENTREGADO' } }),
      this.prisma.premioGanado.count({ where: { estado: 'VENCIDO' } }),
    ]);
    return {
      conteos: { 'por-entregar': porEntregar, 'por-vencer': porVencer, entregados, vencidos },
      datos: filas.map((f) => ({
        id: f.id,
        codigo: f.codigo,
        premio: f.premio.nombre,
        patrocinado: f.premio.patrocinado,
        persona: f.usuario.nombre,
        puntoEntrega: f.puntoEntrega,
        estado: f.estado,
        ganadoEn: f.creadoEn,
        reclamadoEn: f.reclamadoEn,
        venceEn: f.venceEn,
        entregadoEn: f.entregadoEn,
      })),
    };
  }

  // Solo se entrega un premio que su dueño ya reclamó, con el código; avisa a la persona
  async entregar(adminId: string, codigo: string, nota?: string) {
    return this.prisma.$transaction(async (tx) => {
      const premio = await tx.premioGanado.findUnique({
        where: { codigo },
        include: { premio: { select: { nombre: true } } },
      });
      if (!premio) throw new ErrorNegocio('NO_ENCONTRADO', 'No existe un premio con ese código.', 404);
      if (premio.estado === 'ENTREGADO')
        throw new ErrorNegocio('PREMIO_YA_ENTREGADO', 'Ese premio ya se entregó.', 409);
      if (premio.estado !== 'RECLAMADO') {
        throw new ErrorNegocio(
          'PREMIO_NO_RECLAMADO',
          premio.estado === 'VENCIDO' ? 'Ese premio venció sin reclamarse.' : 'La persona aún no reclamó ese premio.',
          409,
        );
      }
      await auditar(tx, {
        adminId,
        tipo: 'PREMIOS',
        accion: 'ENTREGAR',
        entidad: 'premio_ganado',
        entidadId: premio.id,
        motivo: nota?.trim() ? `Entrega confirmada: ${nota.trim()}` : 'Entrega confirmada con el código',
        antes: { estado: 'RECLAMADO' },
        despues: { estado: 'ENTREGADO', premio: premio.premio.nombre },
      });
      const cambio = await tx.premioGanado.updateMany({
        where: { id: premio.id, estado: 'RECLAMADO' },
        data: { estado: 'ENTREGADO' },
      });
      if (cambio.count === 0) throw new ErrorNegocio('PREMIO_YA_ENTREGADO', 'Ese premio ya se entregó.', 409);
      await this.notificaciones.crear(tx, {
        usuarioId: premio.usuarioId,
        tipo: 'GIRO',
        titulo: `Te entregamos tu premio: ${premio.premio.nombre}`,
        mensaje: 'Gracias por reciclar. Lo ves como «Entregado» en Mis premios.',
        enlace: '/puntos/premios',
        obligatoria: true,
      });
      return { id: premio.id, codigo, estado: 'ENTREGADO' as const };
    });
  }

  private async cambiarPausa(adminId: string, pausar: boolean, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.parametro.findUnique({ where: { clave: 'ruleta_en_pausa' } });
      const nuevo = pausar ? '1' : '0';
      if (actual?.valor === nuevo) {
        throw new ErrorNegocio(
          pausar ? 'RULETA_YA_EN_PAUSA' : 'RULETA_YA_EN_MARCHA',
          pausar ? 'La ruleta ya está en pausa.' : 'La ruleta ya está en marcha.',
          409,
        );
      }
      await tx.parametro.update({
        where: { clave: 'ruleta_en_pausa' },
        data: { valor: nuevo, actualizadoEn: new Date() },
      });
      await tx.parametroHistorial.create({
        data: { clave: 'ruleta_en_pausa', valorAnterior: actual?.valor ?? '0', valorNuevo: nuevo, motivo, adminId },
      });
      await auditar(tx, {
        adminId,
        tipo: 'PREMIOS',
        accion: pausar ? 'PAUSAR_RULETA' : 'REANUDAR_RULETA',
        entidad: 'ruleta',
        entidadId: 'ruleta',
        motivo,
        antes: { enPausa: !pausar },
        despues: { enPausa: pausar },
      });
      return { enPausa: pausar };
    });
  }

  pausar(adminId: string, motivo: string) {
    return this.cambiarPausa(adminId, true, motivo);
  }

  reanudar(adminId: string, motivo: string) {
    return this.cambiarPausa(adminId, false, motivo);
  }
}
