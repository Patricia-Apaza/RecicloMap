import { Injectable } from '@nestjs/common';
import {
  type CodigoMaterial,
  type EdicionPublicacion,
  type GrupoPublicacion,
  type NuevaPublicacion,
  TEXTO_OFERTA,
} from '@reciclomap/shared';
import type { Prisma } from '../../generado/prisma/client.js';
import type { PublicacionEstado } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { FotosService } from '../fotos/fotos.service.js';
import type { UbicacionSolicitud } from '../mapa/posicion.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { esViolacionUnica, PublicacionesRepositorio } from './publicaciones.repositorio.js';
import { avisos, nombreCorto } from './textos.js';
import { calificacionPublica, esProVigente } from './vistas.js';

const DIA_MS = 86_400_000;
const ABIERTAS: PublicacionEstado[] = ['DISPONIBLE', 'CON_OFERTAS'];
const GRUPOS: Record<GrupoPublicacion, PublicacionEstado[]> = {
  activas: ['DISPONIBLE', 'CON_OFERTAS', 'EN_NEGOCIACION'],
  finalizadas: ['FINALIZADA'],
  vencidas: ['VENCIDA'],
  canceladas: ['CANCELADA'],
};

const seleccionResumen = {
  id: true,
  estado: true,
  cantidadKg: true,
  precioEsperado: true,
  nota: true,
  creadaEn: true,
  venceEn: true,
  motivoCancelacion: true,
  material: { select: { codigo: true, nombre: true } },
  fotos: { orderBy: { orden: 'asc' }, select: { archivoId: true } },
  ofertas: { select: { estado: true, precioKg: true } },
  operacion: { select: { id: true, estado: true } },
} satisfies Prisma.PublicacionSelect;

type FilaResumen = Prisma.PublicacionGetPayload<{ select: typeof seleccionResumen }>;

export function resumenPublicacion(fila: FilaResumen, ahora = Date.now()) {
  const abierta = ABIERTAS.includes(fila.estado);
  const pendientes = fila.ofertas.filter((oferta) => oferta.estado === 'PENDIENTE');
  return {
    id: fila.id,
    estado: fila.estado,
    material: fila.material as { codigo: CodigoMaterial; nombre: string },
    kg: Number(fila.cantidadKg),
    precioEsperado: fila.precioEsperado?.toFixed(2) ?? null,
    nota: fila.nota,
    fotos: fila.fotos.map((foto) => foto.archivoId),
    creadaEn: fila.creadaEn.toISOString(),
    venceEn: fila.venceEn.toISOString(),
    diasRestantes: abierta ? Math.max(0, Math.ceil((fila.venceEn.getTime() - ahora) / DIA_MS)) : 0,
    motivoCancelacion: fila.motivoCancelacion,
    ofertas: {
      total: fila.ofertas.filter((oferta) => oferta.estado !== 'RETIRADA').length,
      pendientes: pendientes.length,
      mejorPrecioKg: pendientes.length
        ? Math.max(...pendientes.map((oferta) => Number(oferta.precioKg))).toFixed(2)
        : null,
    },
    operacion: fila.operacion,
  };
}

@Injectable()
export class PublicacionesService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly repositorio: PublicacionesRepositorio,
    private readonly notificaciones: NotificacionesService,
    private readonly fotos: FotosService,
  ) {}

  // Pantalla 12: la ubicación viene del dispositivo o de la zona; se guarda en la base y nunca se devuelve
  async crear(usuario: UsuarioSesion, datos: NuevaPublicacion, ubicacion: UbicacionSolicitud) {
    const cuenta = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { ciudadId: true, perfilReciclador: { select: { zonaId: true } } },
    });
    const punto = await this.puntoDePublicacion(cuenta.ciudadId, ubicacion, cuenta.perfilReciclador?.zonaId ?? null);
    const materialId = await this.repositorio.materialId(datos.material);
    const vigencia = await this.repositorio.parametro('vigencia_publicacion_dias', 7);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.fotos.exigirFotosPublicacion(tx, usuario.id, datos.fotos, null);
      const publicacion = await tx.publicacion.create({
        data: {
          recicladorId: usuario.id,
          materialId,
          cantidadKg: datos.kg,
          precioEsperado: datos.precioEsperado ?? null,
          nota: datos.nota || null,
          ciudadId: cuenta.ciudadId,
          venceEn: new Date(Date.now() + vigencia * DIA_MS),
          fotos: { create: datos.fotos.map((archivoId, orden) => ({ archivoId, orden })) },
        },
        select: { id: true },
      });
      await this.repositorio.guardarUbicacion(tx, publicacion.id, punto.punto, punto.origen);
      await this.avisarNegociosCercanos(tx, publicacion.id);
      return publicacion.id;
    });
    return { publicacion: await this.resumen(id), loVeran: await this.repositorio.negociosDeLaCiudad(cuenta.ciudadId) };
  }

  async alcance(usuario: UsuarioSesion) {
    const { ciudadId } = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { ciudadId: true },
    });
    return { negocios: await this.repositorio.negociosDeLaCiudad(ciudadId) };
  }

  // Pantalla 13: pestañas por grupo y los indicadores de las activas
  async listar(usuario: UsuarioSesion, grupo: GrupoPublicacion) {
    const filas = await this.prisma.publicacion.findMany({
      where: { recicladorId: usuario.id },
      orderBy: { creadaEn: 'desc' },
      select: seleccionResumen,
    });
    const ahora = Date.now();
    const todas = filas.map((fila) => resumenPublicacion(fila, ahora));
    const activas = todas.filter((p) => GRUPOS.activas.includes(p.estado));
    const conteos = Object.fromEntries(
      Object.entries(GRUPOS).map(([clave, estados]) => [clave, todas.filter((p) => estados.includes(p.estado)).length]),
    ) as Record<GrupoPublicacion, number>;
    return {
      indicadores: {
        activas: activas.length,
        ofertasSinResponder: activas.reduce((suma, p) => suma + p.ofertas.pendientes, 0),
        kgActivos: activas.reduce((suma, p) => suma + p.kg, 0),
        porVencer: activas.filter((p) => ABIERTAS.includes(p.estado) && p.diasRestantes <= 2).length,
      },
      conteos,
      datos: todas.filter((p) => GRUPOS[grupo].includes(p.estado)),
    };
  }

  // Pantalla 23: estado, vigencia, resumen de ofertas y línea de tiempo
  async detalle(usuario: UsuarioSesion, id: string) {
    const fila = await this.prisma.publicacion.findFirst({
      where: { id, recicladorId: usuario.id },
      select: {
        ...seleccionResumen,
        ofertas: {
          orderBy: { creadaEn: 'asc' },
          select: {
            estado: true,
            precioKg: true,
            creadaEn: true,
            resueltaEn: true,
            comprador: { select: { nombreComercial: true } },
          },
        },
        operacion: { select: { id: true, estado: true, creadaEn: true } },
        actualizadaEn: true,
      },
    });
    if (!fila) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa publicación.', 404);
    const resumen = resumenPublicacion(fila);
    const historial: Array<{ texto: string; detalle: string; fecha: string }> = [
      { texto: 'Publicaste el material', detalle: 'Publicada', fecha: fila.creadaEn.toISOString() },
      ...fila.ofertas
        .filter((oferta) => oferta.estado !== 'RETIRADA')
        .map((oferta) => ({
          texto: `Oferta de ${oferta.comprador.nombreComercial}: S/ ${oferta.precioKg.toFixed(2)} por kg`,
          detalle: oferta.estado === 'PENDIENTE' ? 'Nueva' : TEXTO_OFERTA[oferta.estado],
          fecha: oferta.creadaEn.toISOString(),
        })),
    ];
    if (fila.operacion) {
      historial.push({
        texto: 'Aceptaste una oferta',
        detalle: 'En negociación',
        fecha: fila.operacion.creadaEn.toISOString(),
      });
    }
    if (fila.estado === 'CANCELADA') {
      historial.push({
        texto: `Cancelaste la publicación${fila.motivoCancelacion ? `: ${fila.motivoCancelacion}` : ''}`,
        detalle: 'Cancelada',
        fecha: fila.actualizadaEn.toISOString(),
      });
    }
    if (fila.estado === 'VENCIDA') {
      historial.push({ texto: 'La publicación venció', detalle: 'Vencida', fecha: fila.venceEn.toISOString() });
    }
    historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return {
      ...resumen,
      editable: fila.estado === 'DISPONIBLE',
      historial,
      loVeran: await this.repositorio.negociosDeLaCiudad(
        (await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { ciudadId: true } }))
          .ciudadId,
      ),
    };
  }

  // P15: se edita solo sin ofertas pendientes, es decir, en DISPONIBLE
  async editar(usuario: UsuarioSesion, id: string, datos: EdicionPublicacion) {
    const quitadas = await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id);
      if (fila.estado !== 'DISPONIBLE') {
        throw new ErrorNegocio(
          'PUBLICACION_NO_EDITABLE',
          fila.estado === 'CON_OFERTAS'
            ? 'No puedes editar mientras tengas ofertas pendientes. Respóndelas o cancela la publicación.'
            : 'Esta publicación ya no se puede editar.',
          409,
        );
      }
      await this.fotos.exigirFotosPublicacion(tx, usuario.id, datos.fotos, id);
      const anteriores = await tx.publicacionFoto.findMany({
        where: { publicacionId: id },
        select: { archivoId: true },
      });
      await tx.publicacionFoto.deleteMany({ where: { publicacionId: id } });
      await tx.publicacion.update({
        where: { id },
        data: {
          cantidadKg: datos.kg,
          precioEsperado: datos.precioEsperado ?? null,
          nota: datos.nota || null,
          fotos: { create: datos.fotos.map((archivoId, orden) => ({ archivoId, orden })) },
        },
      });
      return anteriores.map((foto) => foto.archivoId).filter((archivoId) => !datos.fotos.includes(archivoId));
    });
    await this.fotos.borrarSiSueltas(usuario.id, quitadas);
    return this.resumen(id);
  }

  async renovar(usuario: UsuarioSesion, id: string) {
    const vigencia = await this.repositorio.parametro('vigencia_publicacion_dias', 7);
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id);
      if (!ABIERTAS.includes(fila.estado as PublicacionEstado)) {
        throw new ErrorNegocio(
          'PUBLICACION_NO_RENOVABLE',
          'Solo se renuevan las publicaciones disponibles o con ofertas.',
          409,
        );
      }
      await tx.publicacion.update({
        where: { id },
        data: { venceEn: new Date(Date.now() + vigencia * DIA_MS), avisoVencerEn: null },
      });
    });
    return this.resumen(id);
  }

  // Las ofertas pendientes pasan a NO_SELECCIONADA y cada negocio recibe el aviso
  async cancelar(usuario: UsuarioSesion, id: string, motivo: string) {
    await this.prisma.$transaction(async (tx) => {
      const fila = await this.propia(tx, usuario, id);
      if (!ABIERTAS.includes(fila.estado as PublicacionEstado)) {
        throw new ErrorNegocio(
          'PUBLICACION_NO_CANCELABLE',
          fila.estado === 'EN_NEGOCIACION'
            ? 'Ya aceptaste una oferta. La operación se cancela desde su seguimiento.'
            : 'Esta publicación ya no está activa.',
          409,
        );
      }
      await this.cerrarPendientes(tx, id, 'publicacionNoDisponible');
      await tx.publicacion.update({
        where: { id },
        data: { estado: 'CANCELADA', motivoCancelacion: motivo, canceladaPorId: usuario.id },
      });
    });
    return this.resumen(id);
  }

  // Volver a publicar (desde VENCIDA) o duplicar (desde FINALIZADA o CANCELADA): siempre una publicación nueva
  // La ubicación se toma de nuevo, como al publicar: nunca se copia la de la original
  async copiar(usuario: UsuarioSesion, id: string, modo: 'volver' | 'duplicar', ubicacion: UbicacionSolicitud) {
    const permitidos: PublicacionEstado[] = modo === 'volver' ? ['VENCIDA'] : ['FINALIZADA', 'CANCELADA'];
    const vigencia = await this.repositorio.parametro('vigencia_publicacion_dias', 7);
    const cuenta = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { ciudadId: true, perfilReciclador: { select: { zonaId: true } } },
    });
    const nueva = await this.prisma.$transaction(async (tx) => {
      const origen = await tx.publicacion.findFirst({
        where: { id, recicladorId: usuario.id },
        select: { estado: true, materialId: true, cantidadKg: true, precioEsperado: true, nota: true },
      });
      if (!origen) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa publicación.', 404);
      if (!permitidos.includes(origen.estado)) {
        throw new ErrorNegocio(
          'PUBLICACION_NO_COPIABLE',
          modo === 'volver'
            ? 'Solo se vuelve a publicar una publicación vencida.'
            : 'Solo se duplica una publicación finalizada o cancelada.',
          409,
        );
      }
      const punto = await this.puntoDePublicacion(cuenta.ciudadId, ubicacion, cuenta.perfilReciclador?.zonaId ?? null);
      const copia = await tx.publicacion.create({
        data: {
          recicladorId: usuario.id,
          materialId: origen.materialId,
          cantidadKg: origen.cantidadKg,
          precioEsperado: origen.precioEsperado,
          nota: origen.nota,
          ciudadId: cuenta.ciudadId,
          origenId: id,
          venceEn: new Date(Date.now() + vigencia * DIA_MS),
        },
        select: { id: true },
      });
      await this.repositorio.guardarUbicacion(tx, copia.id, punto.punto, punto.origen);
      await this.avisarNegociosCercanos(tx, copia.id);
      return copia.id;
    });
    return this.resumen(nueva);
  }

  // Pantalla 24: ofertas vigentes y no seleccionadas; las rechazadas y retiradas no se muestran
  async ofertasRecibidas(usuario: UsuarioSesion, id: string) {
    const fila = await this.prisma.publicacion.findFirst({
      where: { id, recicladorId: usuario.id },
      select: {
        ...seleccionResumen,
        ofertas: {
          where: { estado: { in: ['PENDIENTE', 'ACEPTADA', 'NO_SELECCIONADA'] } },
          orderBy: { creadaEn: 'asc' },
          select: {
            id: true,
            estado: true,
            precioKg: true,
            total: true,
            mensaje: true,
            cuandoRecoge: true,
            creadaEn: true,
            actualizadaEn: true,
            comprador: {
              select: {
                id: true,
                tipo: true,
                nombreComercial: true,
                vehiculo: true,
                whatsapp: true,
                plan: true,
                planDesde: true,
                planHasta: true,
                califProm: true,
                califCant: true,
              },
            },
          },
        },
      },
    });
    if (!fila) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa publicación.', 404);
    const distancias = await this.repositorio.distanciasKm(
      id,
      fila.ofertas.map((oferta) => oferta.comprador.id),
    );
    const pendientes = fila.ofertas.filter((oferta) => oferta.estado === 'PENDIENTE');
    const mayor = pendientes.length >= 2 ? pendientes.reduce((a, b) => (b.total.gt(a.total) ? b : a)) : null;
    return {
      publicacion: resumenPublicacion({
        ...fila,
        ofertas: fila.ofertas.map((o) => ({ estado: o.estado, precioKg: o.precioKg })),
      }),
      mayorTotalId: mayor?.id ?? null,
      ofertas: fila.ofertas.map((oferta) => ({
        id: oferta.id,
        estado: oferta.estado,
        precioKg: oferta.precioKg.toFixed(2),
        total: oferta.total.toFixed(2),
        mensaje: oferta.mensaje,
        cuandoRecoge: oferta.cuandoRecoge,
        creadaEn: oferta.creadaEn.toISOString(),
        modificada: oferta.actualizadaEn.getTime() - oferta.creadaEn.getTime() > 1000,
        negocio: {
          id: oferta.comprador.id,
          tipo: oferta.comprador.tipo,
          nombre: oferta.comprador.nombreComercial,
          vehiculo: oferta.comprador.vehiculo,
          esPro: esProVigente(oferta.comprador),
          whatsapp: oferta.comprador.whatsapp,
          calificacion: calificacionPublica(oferta.comprador.califProm, oferta.comprador.califCant),
          distanciaKm: distancias.get(oferta.comprador.id) ?? null,
        },
      })),
    };
  }

  // Una sola transacción: la publicación bloqueada impide dos aceptaciones a la vez (RN-08)
  async aceptar(usuario: UsuarioSesion, ofertaId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const oferta = await this.ofertaDe(tx, ofertaId);
        const publicacion = await this.repositorio.bloquear(tx, oferta.publicacionId);
        if (!publicacion || publicacion.recicladorId !== usuario.id) {
          throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa oferta.', 404);
        }
        if (publicacion.estado !== 'CON_OFERTAS' || publicacion.venceEn.getTime() <= Date.now()) {
          throw new ErrorNegocio('PUBLICACION_NO_DISPONIBLE', 'Esta publicación ya no admite aceptar ofertas.', 409);
        }
        const pendientes = await tx.oferta.findMany({
          where: { publicacionId: oferta.publicacionId, estado: 'PENDIENTE' },
          select: {
            id: true,
            compradorId: true,
            precioKg: true,
            total: true,
            comprador: { select: { usuarioId: true } },
          },
        });
        const elegida = pendientes.find((p) => p.id === ofertaId);
        if (!elegida) throw new ErrorNegocio('OFERTA_NO_PENDIENTE', 'Esta oferta ya no está pendiente.', 409);
        const mayor = pendientes.reduce((max, p) => (p.total.gt(max) ? p.total : max), elegida.total);
        const aceptoMayorTotal = pendientes.length >= 2 && elegida.total.equals(mayor);
        const ahora = new Date();

        await tx.oferta.update({ where: { id: ofertaId }, data: { estado: 'ACEPTADA', resueltaEn: ahora } });
        const otras = pendientes.filter((p) => p.id !== ofertaId);
        await tx.oferta.updateMany({
          where: { id: { in: otras.map((p) => p.id) } },
          data: { estado: 'NO_SELECCIONADA', resueltaEn: ahora },
        });
        await tx.publicacion.update({ where: { id: oferta.publicacionId }, data: { estado: 'EN_NEGOCIACION' } });
        const operacion = await tx.operacion.create({
          data: {
            publicacionId: oferta.publicacionId,
            ofertaId,
            recicladorId: usuario.id,
            compradorId: elegida.compradorId,
            ofertasAlAceptar: pendientes.length,
            aceptoMayorTotal,
          },
          select: { id: true },
        });
        // Para la insignia Cazador de precios (Fase 10) y las estadísticas
        await tx.eventoDominio.create({
          data: {
            tipo: 'OFERTA_ACEPTADA',
            entidad: 'operacion',
            entidadId: operacion.id,
            datos: {
              recicladorId: usuario.id,
              compradorId: elegida.compradorId,
              ofertas: pendientes.length,
              aceptoMayorTotal,
            },
          },
        });

        const reciclador = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { nombre: true } });
        const material = oferta.publicacion.material.nombre;
        await this.notificaciones.crear(
          tx,
          avisos.ofertaAceptada({
            usuarioId: elegida.comprador.usuarioId,
            material,
            kg: publicacion.kg,
            operacionId: operacion.id,
            reciclador: nombreCorto(reciclador.nombre),
            precioKg: elegida.precioKg.toString(),
          }),
        );
        for (const otra of otras) {
          await this.notificaciones.crear(
            tx,
            avisos.ofertaNoSeleccionada({ usuarioId: otra.comprador.usuarioId, material, kg: publicacion.kg }),
          );
        }
        return { operacionId: operacion.id, aceptoMayorTotal, noSeleccionadas: otras.length };
      });
    } catch (error) {
      if (esViolacionUnica(error)) {
        throw new ErrorNegocio('PUBLICACION_NO_DISPONIBLE', 'Esta publicación ya no admite aceptar ofertas.', 409);
      }
      throw error;
    }
  }

  // Si no queda ninguna oferta pendiente, la publicación vuelve a DISPONIBLE
  async rechazar(usuario: UsuarioSesion, ofertaId: string) {
    return this.prisma.$transaction(async (tx) => {
      const oferta = await this.ofertaDe(tx, ofertaId);
      const publicacion = await this.repositorio.bloquear(tx, oferta.publicacionId);
      if (!publicacion || publicacion.recicladorId !== usuario.id) {
        throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa oferta.', 404);
      }
      const actual = await tx.oferta.findUniqueOrThrow({
        where: { id: ofertaId },
        select: { estado: true, comprador: { select: { usuarioId: true } } },
      });
      if (actual.estado !== 'PENDIENTE') {
        throw new ErrorNegocio('OFERTA_NO_PENDIENTE', 'Esta oferta ya no está pendiente.', 409);
      }
      await tx.oferta.update({ where: { id: ofertaId }, data: { estado: 'RECHAZADA', resueltaEn: new Date() } });
      const quedan = await tx.oferta.count({ where: { publicacionId: oferta.publicacionId, estado: 'PENDIENTE' } });
      if (quedan === 0 && publicacion.estado === 'CON_OFERTAS') {
        await tx.publicacion.update({ where: { id: oferta.publicacionId }, data: { estado: 'DISPONIBLE' } });
      }
      await this.notificaciones.crear(
        tx,
        avisos.ofertaNoSeleccionada({
          usuarioId: actual.comprador.usuarioId,
          material: oferta.publicacion.material.nombre,
          kg: publicacion.kg,
        }),
      );
      return { estadoPublicacion: quedan === 0 ? 'DISPONIBLE' : publicacion.estado, pendientes: quedan };
    });
  }

  // Ofertas pendientes a NO_SELECCIONADA con aviso al negocio (cancelación y vencimiento)
  async cerrarPendientes(tx: ClienteBd, publicacionId: string, aviso: 'publicacionNoDisponible'): Promise<number> {
    const pendientes = await tx.oferta.findMany({
      where: { publicacionId, estado: 'PENDIENTE' },
      select: {
        id: true,
        comprador: { select: { usuarioId: true } },
        publicacion: { select: { cantidadKg: true, material: { select: { nombre: true } } } },
      },
    });
    if (pendientes.length === 0) return 0;
    await tx.oferta.updateMany({
      where: { id: { in: pendientes.map((p) => p.id) } },
      data: { estado: 'NO_SELECCIONADA', resueltaEn: new Date() },
    });
    for (const oferta of pendientes) {
      await this.notificaciones.crear(
        tx,
        avisos[aviso]({
          usuarioId: oferta.comprador.usuarioId,
          material: oferta.publicacion.material.nombre,
          kg: oferta.publicacion.cantidadKg.toString(),
        }),
      );
    }
    return pendientes.length;
  }

  async resumen(id: string) {
    const fila = await this.prisma.publicacion.findUniqueOrThrow({ where: { id }, select: seleccionResumen });
    return resumenPublicacion(fila);
  }

  // "Nueva publicación cerca": a los negocios verificados de la ciudad dentro del radio de aviso
  private async avisarNegociosCercanos(tx: ClienteBd, publicacionId: string): Promise<void> {
    const radio = await this.repositorio.parametro('radio_aviso_publicacion_km', 5);
    const publicacion = await tx.publicacion.findUniqueOrThrow({
      where: { id: publicacionId },
      select: { cantidadKg: true, material: { select: { nombre: true } } },
    });
    const negocios = await this.repositorio.negociosParaAviso(tx, publicacionId, radio * 1000);
    for (const negocio of negocios) {
      await this.notificaciones.crear(
        tx,
        avisos.nuevaCerca({
          usuarioId: negocio.usuario_id,
          material: publicacion.material.nombre,
          kg: publicacion.cantidadKg.toString(),
          publicacionId,
          tramo: negocio.tramo,
          esCentro: negocio.tipo === 'CENTRO',
        }),
      );
    }
  }

  private async puntoDePublicacion(ciudadId: number, ubicacion: UbicacionSolicitud, zonaPerfil: number | null) {
    if (ubicacion.posicion) return { punto: ubicacion.posicion, origen: 'GPS' as const };
    const zonaId = ubicacion.zonaId ?? zonaPerfil;
    if (zonaId) {
      const centro = await this.repositorio.centroDeZona(zonaId, ciudadId);
      if (!centro) throw new ErrorNegocio('ZONA_NO_VALIDA', 'Elige una zona de tu ciudad.', 422);
      return { punto: centro, origen: 'ZONA' as const };
    }
    throw new ErrorNegocio(
      'UBICACION_REQUERIDA',
      'Comparte tu ubicación o elige tu zona para publicar. Nunca se muestra a nadie.',
      400,
    );
  }

  private async propia(tx: ClienteBd, usuario: UsuarioSesion, id: string) {
    const fila = await this.repositorio.bloquear(tx, id);
    if (!fila || fila.recicladorId !== usuario.id) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa publicación.', 404);
    }
    return fila;
  }

  private async ofertaDe(tx: ClienteBd, ofertaId: string) {
    const oferta = await tx.oferta.findUnique({
      where: { id: ofertaId },
      select: { publicacionId: true, publicacion: { select: { material: { select: { nombre: true } } } } },
    });
    if (!oferta) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa oferta.', 404);
    return oferta;
  }
}
