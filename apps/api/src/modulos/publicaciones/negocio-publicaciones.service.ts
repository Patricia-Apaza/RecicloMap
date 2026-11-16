import { Injectable } from '@nestjs/common';
import type { CodigoMaterial, DatosOferta, TramoDistancia } from '@reciclomap/shared';
import type { Prisma } from '../../generado/prisma/client.js';
import type { OfertaEstado } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { esViolacionUnica, PublicacionesRepositorio } from './publicaciones.repositorio.js';
import { avisos } from './textos.js';
import { recicladorPublico, seleccionRecicladorPublico } from './vistas.js';

const DIA_MS = 86_400_000;

export type FiltroOfertasEnviadas = 'todas' | 'pendientes' | 'aceptadas' | 'no-seleccionadas' | 'retiradas';
const ESTADOS_FILTRO: Record<FiltroOfertasEnviadas, OfertaEstado[] | null> = {
  todas: null,
  pendientes: ['PENDIENTE'],
  aceptadas: ['ACEPTADA'],
  'no-seleccionadas': ['RECHAZADA', 'NO_SELECCIONADA'],
  retiradas: ['RETIRADA'],
};

// Lo que el negocio ve de una publicación: nunca nombre, barrio, coordenadas, distancia numérica ni ofertas ajenas
const seleccionPublicacion = {
  id: true,
  estado: true,
  cantidadKg: true,
  precioEsperado: true,
  nota: true,
  creadaEn: true,
  venceEn: true,
  material: { select: { codigo: true, nombre: true } },
  fotos: { orderBy: { orden: 'asc' }, select: { archivoId: true } },
  reciclador: { select: { id: true, ...seleccionRecicladorPublico } },
} satisfies Prisma.PublicacionSelect;

type FilaPublicacion = Prisma.PublicacionGetPayload<{ select: typeof seleccionPublicacion }>;
type MiOferta = { id: string; estado: OfertaEstado; precioKg: string; total: string; operacionId: string | null };

@Injectable()
export class NegocioPublicacionesService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly repositorio: PublicacionesRepositorio,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Pantallas 42 y 52: todas las de la ciudad (RF-23), de la más cercana a la más lejana por tramo
  async cercanas(usuario: UsuarioSesion, material?: CodigoMaterial, pagina = 1, porPagina = 20) {
    const compradorId = this.negocio(usuario);
    const todas = await this.repositorio.cercanas(compradorId);
    const delMaterial = material
      ? new Set(
          (
            await this.prisma.publicacion.findMany({
              where: { id: { in: todas.map((v) => v.id) }, material: { codigo: material } },
              select: { id: true },
            })
          ).map((fila) => fila.id),
        )
      : null;
    const filtradas = delMaterial ? todas.filter((v) => delMaterial.has(v.id)) : todas;
    // Ciudades grandes: se pagina sobre la lista ya ordenada por distancia
    const visibles = filtradas.slice((pagina - 1) * porPagina, pagina * porPagina);
    const filas = await this.prisma.publicacion.findMany({
      where: { id: { in: visibles.map((v) => v.id) } },
      select: seleccionPublicacion,
    });
    const porId = new Map(filas.map((fila) => [fila.id, fila]));
    const [compra, ofertas] = await Promise.all([
      this.materialesQueCompra(compradorId),
      this.misOfertas(
        compradorId,
        filas.map((f) => f.id),
      ),
    ]);
    const datos = visibles
      .filter((v) => porId.has(v.id))
      .map((v) => this.vista(porId.get(v.id)!, v.tramo, compra, ofertas.get(v.id) ?? null));
    return { total: filtradas.length, pagina, porPagina, datos };
  }

  // Pantalla 44: además, el precio propio para ese material y las reseñas que recibió el reciclador
  async detalle(usuario: UsuarioSesion, id: string) {
    const compradorId = this.negocio(usuario);
    const { fila, tramo, miOferta } = await this.visible(compradorId, id);
    const [compra, precio, resenas] = await Promise.all([
      this.materialesQueCompra(compradorId),
      this.prisma.precioMaterial.findFirst({
        where: { compradorId, activo: true, material: { codigo: fila.material.codigo } },
        select: { precioMin: true, precioMax: true },
      }),
      this.prisma.calificacion.findMany({
        where: { destinoId: fila.reciclador.id, oculta: null },
        orderBy: { creadaEn: 'desc' },
        take: 10,
        select: {
          estrellas: true,
          comentario: true,
          creadaEn: true,
          autor: { select: { nombre: true, comprador: { select: { nombreComercial: true } } } },
          etiquetas: { select: { etiqueta: { select: { nombre: true } } } },
        },
      }),
    ]);
    return {
      ...this.vista(fila, tramo, compra, miOferta),
      miPrecio: precio ? { min: precio.precioMin.toFixed(2), max: precio.precioMax.toFixed(2) } : null,
      resenas: resenas.map((r) => ({
        estrellas: r.estrellas,
        comentario: r.comentario,
        etiquetas: r.etiquetas.map((e) => e.etiqueta.nombre),
        autor: r.autor.comprador?.nombreComercial ?? r.autor.nombre,
        creadaEn: r.creadaEn.toISOString(),
      })),
    };
  }

  // Pantalla 44: una oferta vigente por negocio y publicación; tras un rechazo no se vuelve a ofertar (S2)
  async ofertar(usuario: UsuarioSesion, publicacionId: string, datos: DatosOferta) {
    const compradorId = this.negocio(usuario);
    try {
      const ofertaId = await this.prisma.$transaction(async (tx) => {
        const publicacion = await this.abiertaParaOfertar(tx, usuario, publicacionId);
        const previa = await tx.oferta.findFirst({
          where: { publicacionId, compradorId, estado: { not: 'RETIRADA' } },
          select: { estado: true },
        });
        if (previa) throw this.errorPorOfertaPrevia(previa.estado);
        const oferta = await tx.oferta.create({
          data: {
            publicacionId,
            compradorId,
            precioKg: datos.precioKg,
            total: Math.round(datos.precioKg * publicacion.kg * 100) / 100,
            mensaje: datos.mensaje || null,
            cuandoRecoge: datos.cuandoRecoge ?? null,
          },
          select: { id: true },
        });
        if (publicacion.estado === 'DISPONIBLE') {
          await tx.publicacion.update({ where: { id: publicacionId }, data: { estado: 'CON_OFERTAS' } });
        }
        await this.notificaciones.crear(
          tx,
          avisos.nuevaOferta({
            usuarioId: publicacion.recicladorId,
            material: publicacion.material,
            kg: publicacion.kg,
            publicacionId,
            negocio: publicacion.negocio,
            precioKg: datos.precioKg,
          }),
        );
        return oferta.id;
      });
      return this.ofertaPropia(compradorId, ofertaId);
    } catch (error) {
      if (esViolacionUnica(error)) {
        throw new ErrorNegocio('OFERTA_EXISTENTE', 'Ya tienes una oferta en esta publicación. Puedes cambiarla.', 409);
      }
      throw error;
    }
  }

  // Cambiar la oferta avisa al reciclador; el total se recalcula en la base
  async cambiarOferta(usuario: UsuarioSesion, ofertaId: string, datos: DatosOferta) {
    const compradorId = this.negocio(usuario);
    await this.prisma.$transaction(async (tx) => {
      const oferta = await this.pendientePropia(tx, compradorId, ofertaId);
      const publicacion = await this.abiertaParaOfertar(tx, usuario, oferta.publicacionId);
      await tx.oferta.update({
        where: { id: ofertaId },
        data: {
          precioKg: datos.precioKg,
          total: Math.round(datos.precioKg * publicacion.kg * 100) / 100,
          mensaje: datos.mensaje || null,
          cuandoRecoge: datos.cuandoRecoge ?? null,
        },
      });
      await this.notificaciones.crear(
        tx,
        avisos.ofertaModificada({
          usuarioId: publicacion.recicladorId,
          material: publicacion.material,
          kg: publicacion.kg,
          publicacionId: oferta.publicacionId,
          negocio: publicacion.negocio,
          precioKg: datos.precioKg,
        }),
      );
    });
    return this.ofertaPropia(compradorId, ofertaId);
  }

  // Retirar permite volver a ofertar después (S2); sin ofertas pendientes la publicación vuelve a DISPONIBLE
  async retirar(usuario: UsuarioSesion, ofertaId: string) {
    const compradorId = this.negocio(usuario);
    await this.prisma.$transaction(async (tx) => {
      const oferta = await this.pendientePropia(tx, compradorId, ofertaId);
      const publicacion = await this.repositorio.bloquear(tx, oferta.publicacionId);
      const actual = await tx.oferta.findUniqueOrThrow({ where: { id: ofertaId }, select: { estado: true } });
      if (actual.estado !== 'PENDIENTE') {
        throw new ErrorNegocio('OFERTA_NO_PENDIENTE', 'Esta oferta ya no está pendiente.', 409);
      }
      await tx.oferta.update({ where: { id: ofertaId }, data: { estado: 'RETIRADA', resueltaEn: new Date() } });
      const quedan = await tx.oferta.count({ where: { publicacionId: oferta.publicacionId, estado: 'PENDIENTE' } });
      if (quedan === 0 && publicacion?.estado === 'CON_OFERTAS') {
        await tx.publicacion.update({ where: { id: oferta.publicacionId }, data: { estado: 'DISPONIBLE' } });
      }
    });
    return this.ofertaPropia(compradorId, ofertaId);
  }

  // Pantalla 45: ofertas enviadas con sus estados; el tramo, nunca el barrio
  async enviadas(usuario: UsuarioSesion, filtro: FiltroOfertasEnviadas) {
    const compradorId = this.negocio(usuario);
    const filas = await this.prisma.oferta.findMany({
      where: { compradorId },
      orderBy: { creadaEn: 'desc' },
      select: {
        id: true,
        estado: true,
        precioKg: true,
        total: true,
        mensaje: true,
        cuandoRecoge: true,
        creadaEn: true,
        operacion: { select: { id: true, estado: true } },
        publicacion: {
          select: { id: true, cantidadKg: true, venceEn: true, material: { select: { codigo: true, nombre: true } } },
        },
      },
    });
    const respondidas = filas.filter((f) => ['ACEPTADA', 'RECHAZADA', 'NO_SELECCIONADA'].includes(f.estado));
    const aceptadas = filas.filter((f) => f.estado === 'ACEPTADA').length;
    const estados = ESTADOS_FILTRO[filtro];
    const elegidas = filas.filter((f) => !estados || estados.includes(f.estado));
    const tramos = await Promise.all(elegidas.map((f) => this.repositorio.tramo(f.publicacion.id, compradorId)));
    const conteo = (clave: FiltroOfertasEnviadas) =>
      filas.filter((f) => !ESTADOS_FILTRO[clave] || ESTADOS_FILTRO[clave].includes(f.estado)).length;
    return {
      indicadores: {
        enviadas: filas.filter((f) => f.estado !== 'RETIRADA').length,
        pendientes: filas.filter((f) => f.estado === 'PENDIENTE').length,
        aceptadas,
        tasaAceptacion: respondidas.length ? Math.round((aceptadas / respondidas.length) * 100) : null,
      },
      conteos: {
        todas: conteo('todas'),
        pendientes: conteo('pendientes'),
        aceptadas: conteo('aceptadas'),
        'no-seleccionadas': conteo('no-seleccionadas'),
        retiradas: conteo('retiradas'),
      },
      datos: elegidas.map((f, i) => ({
        id: f.id,
        estado: f.estado,
        precioKg: f.precioKg.toFixed(2),
        total: f.total.toFixed(2),
        mensaje: f.mensaje,
        cuandoRecoge: f.cuandoRecoge,
        creadaEn: f.creadaEn.toISOString(),
        operacion: f.operacion,
        publicacion: {
          id: f.publicacion.id,
          material: f.publicacion.material as { codigo: CodigoMaterial; nombre: string },
          kg: Number(f.publicacion.cantidadKg),
          tramo: tramos[i] ?? null,
        },
      })),
    };
  }

  private vista(fila: FilaPublicacion, tramo: TramoDistancia | null, compra: Set<string>, miOferta: MiOferta | null) {
    return {
      id: fila.id,
      // "Disponible" aunque tenga ofertas: el negocio no sabe si otros ofertaron ni cuántos
      estado: 'DISPONIBLE' as const,
      material: fila.material as { codigo: CodigoMaterial; nombre: string },
      kg: Number(fila.cantidadKg),
      precioEsperado: fila.precioEsperado?.toFixed(2) ?? null,
      nota: fila.nota,
      fotos: fila.fotos.map((foto) => foto.archivoId),
      creadaEn: fila.creadaEn.toISOString(),
      venceEn: fila.venceEn.toISOString(),
      diasRestantes: Math.max(0, Math.ceil((fila.venceEn.getTime() - Date.now()) / DIA_MS)),
      tramo,
      compraEsteMaterial: compra.has(fila.material.codigo),
      miOferta,
      reciclador: recicladorPublico(fila.reciclador),
    };
  }

  // Visible si sigue abierta en su ciudad, o si este negocio ya ofertó en ella
  private async visible(compradorId: string, id: string) {
    const fila = await this.prisma.publicacion.findUnique({ where: { id }, select: seleccionPublicacion });
    const miOferta = fila ? ((await this.misOfertas(compradorId, [id])).get(id) ?? null) : null;
    const abierta = fila ? (await this.repositorio.cercanas(compradorId)).find((v) => v.id === id) : undefined;
    if (!fila || (!abierta && !miOferta)) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'Esta publicación ya no está disponible.', 404);
    }
    return { fila, tramo: abierta?.tramo ?? (await this.repositorio.tramo(id, compradorId)), miOferta };
  }

  private async abiertaParaOfertar(tx: ClienteBd, usuario: UsuarioSesion, publicacionId: string) {
    const bloqueada = await this.repositorio.bloquear(tx, publicacionId);
    const datos = await tx.publicacion.findUnique({
      where: { id: publicacionId },
      select: { ciudadId: true, material: { select: { nombre: true } } },
    });
    const negocio = await tx.comprador.findUniqueOrThrow({
      where: { id: this.negocio(usuario) },
      select: { nombreComercial: true, usuario: { select: { ciudadId: true } } },
    });
    if (!bloqueada || !datos || datos.ciudadId !== negocio.usuario.ciudadId) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'Esta publicación ya no está disponible.', 404);
    }
    if (!['DISPONIBLE', 'CON_OFERTAS'].includes(bloqueada.estado) || bloqueada.venceEn.getTime() <= Date.now()) {
      throw new ErrorNegocio('PUBLICACION_NO_DISPONIBLE', 'Esta publicación ya no recibe ofertas.', 409);
    }
    return { ...bloqueada, material: datos.material.nombre, negocio: negocio.nombreComercial };
  }

  private errorPorOfertaPrevia(estado: OfertaEstado): ErrorNegocio {
    if (estado === 'PENDIENTE') {
      return new ErrorNegocio('OFERTA_EXISTENTE', 'Ya tienes una oferta en esta publicación. Puedes cambiarla.', 409);
    }
    if (estado === 'RECHAZADA') {
      return new ErrorNegocio(
        'OFERTA_RECHAZADA',
        'El reciclador rechazó tu oferta. No puedes volver a ofertar en esta publicación.',
        409,
      );
    }
    return new ErrorNegocio('PUBLICACION_NO_DISPONIBLE', 'Esta publicación ya no recibe ofertas.', 409);
  }

  private async pendientePropia(tx: ClienteBd, compradorId: string, ofertaId: string) {
    const oferta = await tx.oferta.findFirst({
      where: { id: ofertaId, compradorId },
      select: { estado: true, publicacionId: true },
    });
    if (!oferta) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa oferta.', 404);
    if (oferta.estado !== 'PENDIENTE') {
      throw new ErrorNegocio('OFERTA_NO_PENDIENTE', 'Esta oferta ya no está pendiente.', 409);
    }
    return oferta;
  }

  private async ofertaPropia(compradorId: string, ofertaId: string) {
    const oferta = (await this.prisma.oferta.findFirst({
      where: { id: ofertaId, compradorId },
      select: { publicacionId: true },
    }))!;
    return (await this.misOfertas(compradorId, [oferta.publicacionId])).get(oferta.publicacionId) ?? null;
  }

  // La oferta vigente propia por publicación: la más reciente que no se retiró, o la retirada si no hay otra
  private async misOfertas(compradorId: string, publicaciones: string[]): Promise<Map<string, MiOferta>> {
    const filas = await this.prisma.oferta.findMany({
      where: { compradorId, publicacionId: { in: publicaciones } },
      orderBy: { creadaEn: 'asc' },
      select: {
        id: true,
        publicacionId: true,
        estado: true,
        precioKg: true,
        total: true,
        operacion: { select: { id: true } },
      },
    });
    const mapa = new Map<string, MiOferta>();
    for (const fila of filas) {
      const actual = mapa.get(fila.publicacionId);
      if (actual && actual.estado !== 'RETIRADA' && fila.estado === 'RETIRADA') continue;
      mapa.set(fila.publicacionId, {
        id: fila.id,
        estado: fila.estado,
        precioKg: fila.precioKg.toFixed(2),
        total: fila.total.toFixed(2),
        operacionId: fila.operacion?.id ?? null,
      });
    }
    return mapa;
  }

  private async materialesQueCompra(compradorId: string): Promise<Set<string>> {
    const precios = await this.prisma.precioMaterial.findMany({
      where: { compradorId, activo: true },
      select: { material: { select: { codigo: true } } },
    });
    return new Set(precios.map((p) => p.material.codigo));
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
