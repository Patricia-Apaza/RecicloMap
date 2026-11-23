import { Injectable } from '@nestjs/common';
import { EXPORTACIONES_POR_DIA } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { Codigos } from '../auth/codigos.js';
import { Reautenticacion } from './reautenticacion.js';

const hoyEnLima = (ahora = new Date()) => ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const num = (valor: { toString(): string } | null | undefined) => (valor == null ? null : Number(valor.toString()));
const dia = (fecha: Date | null | undefined) => (fecha ? fecha.toISOString().slice(0, 10) : null);

type Ubicacion = { publicacion_id: string; lat: number; lng: number; origen: string };

// Copia legible y portable de los datos de la propia persona. Nunca incluye teléfonos, correos ni ubicaciones de otras personas
@Injectable()
export class ExportacionService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly reautenticacion: Reautenticacion,
    private readonly codigos: Codigos,
  ) {}

  // Sin contraseña (cuenta de Google) se confirma con un código al teléfono verificado
  async pedirCodigo(usuarioId: string) {
    if (await this.reautenticacion.tieneContrasena(usuarioId)) {
      throw new ErrorNegocio('CONTRASENA_DISPONIBLE', 'Tu cuenta tiene contraseña: úsala para confirmar.', 409);
    }
    const { telefono } = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { telefono: true },
    });
    return this.codigos.enviar({ destino: telefono, proposito: 'CONFIRMAR_ACCION', canal: 'sms', usuarioId });
  }

  async exportar(usuarioId: string, contrasena: string | undefined, codigo: string | undefined, ahora = new Date()) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { hashContrasena: true, telefono: true },
    });
    const hoy = new Date(`${hoyEnLima(ahora)}T00:00:00.000Z`);
    // El límite diario se mira primero: no revela nada y evita gastar intentos de contraseña o de código
    const previa = await this.prisma.exportacionDatos.count({ where: { usuarioId, dia: hoy } });
    if (previa >= EXPORTACIONES_POR_DIA) throw this.limite();
    if (usuario.hashContrasena) await this.reautenticacion.exigirContrasena(usuarioId, contrasena);
    else await this.reautenticacion.exigirCodigo(usuarioId, usuario.telefono, 'CONFIRMAR_ACCION', codigo);

    // Todo en una transacción: la exportación del día se registra primero y es la que autoriza leer la ubicación propia
    const documento = await this.prisma
      .$transaction(
        async (tx) => {
          await tx.exportacionDatos.create({ data: { usuarioId, dia: hoy } });
          await tx.registroPrivacidad.create({ data: { usuarioId, tipo: 'EXPORTACION' } });
          await tx.$executeRaw`SELECT set_config('rm.usuario_id', ${usuarioId}, true)`;
          return this.armar(usuarioId, ahora, tx);
        },
        { timeout: 30_000 },
      )
      .catch((error: unknown) => {
        throw error instanceof ErrorNegocio
          ? error
          : (error as { code?: string }).code === 'P2002'
            ? this.limite()
            : error;
      });
    return { nombreArchivo: `reciclomap-datos-${hoyEnLima(ahora)}.json`, documento };
  }

  async estado(usuarioId: string, ahora = new Date()) {
    const hoy = new Date(`${hoyEnLima(ahora)}T00:00:00.000Z`);
    const ultima = await this.prisma.exportacionDatos.findFirst({
      where: { usuarioId },
      orderBy: { creadaEn: 'desc' },
    });
    const hechaHoy = await this.prisma.exportacionDatos.count({ where: { usuarioId, dia: hoy } });
    return { disponible: hechaHoy < EXPORTACIONES_POR_DIA, ultimaEn: ultima?.creadaEn ?? null };
  }

  private limite() {
    return new ErrorNegocio('EXPORTACION_DIARIA', 'Ya descargaste tus datos hoy. Puedes pedir otra copia mañana.', 429);
  }

  private async armar(usuarioId: string, ahora: Date, db: ClienteBd) {
    const usuario = await db.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: {
        id: true,
        rol: true,
        nombre: true,
        telefono: true,
        correo: true,
        creadoEn: true,
        ciudad: { select: { nombre: true } },
        foto: { select: { id: true } },
        preferencia: true,
        consentimientos: { orderBy: { aceptadoEn: 'asc' }, select: { tipo: true, version: true, aceptadoEn: true } },
        identidades: { select: { proveedor: true, creadaEn: true } },
        perfilReciclador: {
          select: {
            sobreMi: true,
            nivel: { select: { nombre: true } },
            kgTotal: true,
            puntos: true,
            puntosReciclaje: true,
            rachaSemanas: true,
            operacionesCompletadas: true,
            codigoInvitacion: true,
            zona: { select: { nombre: true } },
          },
        },
        materiales: { select: { material: { select: { nombre: true } } } },
        comprador: {
          select: {
            id: true,
            tipo: true,
            nombreComercial: true,
            descripcion: true,
            direccion: true,
            telefonoNegocio: true,
            whatsapp: true,
            plan: true,
            planDesde: true,
            planHasta: true,
            estadoVerificacion: true,
            disponibilidad: true,
            zona: { select: { nombre: true } },
            horarios: { select: { dia: true, abre: true, cierra: true } },
            pagos: { select: { metodo: true } },
            fotos: { select: { orden: true } },
            paradas: { select: { zona: { select: { nombre: true } }, desde: true, hasta: true } },
          },
        },
      },
    });
    const compradorId = usuario.comprador?.id;
    const hora = (fecha: Date | null) => (fecha ? fecha.toISOString().slice(11, 16) : null);

    const [
      publicaciones,
      ubicaciones,
      ofertasHechas,
      operaciones,
      escritas,
      recibidas,
      reportes,
      movimientos,
      giros,
      premios,
    ] = await Promise.all([
      db.publicacion.findMany({
        where: { recicladorId: usuarioId },
        orderBy: { creadaEn: 'asc' },
        select: {
          id: true,
          material: { select: { nombre: true } },
          cantidadKg: true,
          precioEsperado: true,
          nota: true,
          estado: true,
          motivoCancelacion: true,
          creadaEn: true,
          venceEn: true,
          _count: { select: { fotos: true } },
          ofertas: {
            select: {
              precioKg: true,
              total: true,
              mensaje: true,
              estado: true,
              creadaEn: true,
              comprador: { select: { nombreComercial: true } },
            },
          },
        },
      }),
      db.$queryRaw<Ubicacion[]>`SELECT * FROM ubicaciones_propias()`,
      compradorId
        ? db.oferta.findMany({
            where: { compradorId },
            orderBy: { creadaEn: 'asc' },
            select: {
              precioKg: true,
              total: true,
              mensaje: true,
              cuandoRecoge: true,
              estado: true,
              creadaEn: true,
              publicacion: { select: { material: { select: { nombre: true } }, cantidadKg: true } },
            },
          })
        : Promise.resolve([]),
      db.operacion.findMany({
        where: { OR: [{ recicladorId: usuarioId }, ...(compradorId ? [{ compradorId }] : [])] },
        orderBy: { creadaEn: 'asc' },
        select: {
          id: true,
          estado: true,
          creadaEn: true,
          completadaEn: true,
          canceladaEn: true,
          kgFinal: true,
          montoFinal: true,
          motivoCancelacion: true,
          publicacion: { select: { material: { select: { nombre: true } }, cantidadKg: true } },
          reciclador: { select: { nombre: true } },
          comprador: { select: { nombreComercial: true } },
          coordinacion: { select: { referencia: true, dia: true, mensaje: true } },
        },
      }),
      db.calificacion.findMany({
        where: { autorId: usuarioId },
        orderBy: { creadaEn: 'asc' },
        select: { operacionId: true, estrellas: true, comentario: true, creadaEn: true },
      }),
      db.calificacion.findMany({
        where: { destinoId: usuarioId },
        orderBy: { creadaEn: 'asc' },
        select: {
          operacionId: true,
          estrellas: true,
          comentario: true,
          creadaEn: true,
          autor: { select: { nombre: true } },
        },
      }),
      db.reporte.findMany({
        where: { autorId: usuarioId },
        orderBy: { creadoEn: 'asc' },
        select: { tipo: true, motivo: true, detalle: true, estado: true, creadoEn: true },
      }),
      db.movimientoPuntos.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: 'asc' },
        select: { puntos: true, motivo: true, cuentaParaGiros: true, creadoEn: true },
      }),
      db.giro.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: 'asc' },
        select: { origen: true, creadoEn: true, usadoEn: true },
      }),
      db.premioGanado.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: 'asc' },
        select: {
          codigo: true,
          estado: true,
          puntoEntrega: true,
          venceEn: true,
          reclamadoEn: true,
          entregadoEn: true,
          creadoEn: true,
          premio: { select: { nombre: true, tipo: true } },
        },
      }),
    ]);

    const [insignias, desafios, registros, favoritos, busquedas, notificaciones, solicitudesPlan, sesiones, push] =
      await Promise.all([
        db.usuarioInsignia.findMany({
          where: { usuarioId },
          select: { obtenidaEn: true, insignia: { select: { nombre: true } } },
        }),
        db.usuarioDesafio.findMany({
          where: { usuarioId },
          select: {
            progreso: true,
            completadoEn: true,
            reclamadoEn: true,
            desafio: { select: { mes: true, plantilla: { select: { nombre: true } } } },
          },
        }),
        db.registroReciclaje.findMany({
          where: { OR: [{ recicladorId: usuarioId }, ...(compradorId ? [{ compradorId }] : [])] },
          orderBy: { creadoEn: 'asc' },
          select: {
            fecha: true,
            kg: true,
            kgConfirmado: true,
            estado: true,
            puntosOtorgados: true,
            comprador: { select: { nombreComercial: true } },
          },
        }),
        db.favorito.findMany({
          where: { usuarioId },
          select: {
            creadoEn: true,
            alertaPrecio: true,
            alertaAvisos: true,
            comprador: { select: { nombreComercial: true } },
          },
        }),
        db.busquedaGuardada.findMany({
          where: { usuarioId },
          select: { nombre: true, filtros: true, creadaEn: true },
        }),
        db.notificacion.findMany({
          where: { usuarioId },
          orderBy: { creadaEn: 'asc' },
          select: { tipo: true, titulo: true, mensaje: true, creadaEn: true, leidaEn: true },
        }),
        compradorId
          ? db.solicitudPlan.findMany({
              where: { compradorId },
              select: { estado: true, mensaje: true, motivoDecision: true, desde: true, hasta: true, creadaEn: true },
            })
          : Promise.resolve([]),
        db.sesion.findMany({
          where: { usuarioId, revocadaEn: null, expiraEn: { gt: ahora } },
          select: { creadaEn: true, agente: true },
        }),
        db.suscripcionPush.count({ where: { usuarioId } }),
      ]);
    const precios = compradorId
      ? await db.precioMaterial.findMany({
          where: { compradorId },
          select: {
            material: { select: { nombre: true } },
            precioMin: true,
            precioMax: true,
            demanda: true,
            activo: true,
            actualizadoEn: true,
          },
        })
      : [];
    const avisos = compradorId
      ? await db.aviso.findMany({
          where: { compradorId },
          select: { tipo: true, titulo: true, mensaje: true, vigenteHasta: true, estado: true, creadoEn: true },
        })
      : [];

    const p = usuario.perfilReciclador;
    const c = usuario.comprador;
    return {
      formato: 'reciclomap-exportacion',
      version: 1,
      generadoEn: ahora.toISOString(),
      zonaHoraria: 'America/Lima',
      aviso:
        'Esta copia contiene solo tus datos. No incluye teléfonos, correos ni ubicaciones de otras personas; la otra parte de cada operación aparece como se ve en la app.',
      cuenta: {
        rol: usuario.rol,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        correo: usuario.correo,
        ciudad: usuario.ciudad.nombre,
        creadaEn: usuario.creadoEn,
        tieneFoto: usuario.foto !== null,
        iniciosConOtrosProveedores: usuario.identidades.map((i) => ({ proveedor: i.proveedor, desde: i.creadaEn })),
        sesionesActivas: sesiones.map((s) => ({ desde: s.creadaEn, dispositivo: s.agente })),
        notificacionesPush: push,
      },
      preferencias: usuario.preferencia
        ? {
            notificarOfertas: usuario.preferencia.notifOfertas,
            notificarPremios: usuario.preferencia.notifPremios,
            notificarPrecios: usuario.preferencia.notifPrecios,
            notificarAvisos: usuario.preferencia.notifAvisos,
            alertaFavoritoPrecio: usuario.preferencia.alertaFavPrecio,
            alertaFavoritoHorario: usuario.preferencia.alertaFavHorario,
            alertaFavoritoMovilCerca: usuario.preferencia.alertaFavMovilCerca,
            apareceEnRanking: usuario.preferencia.visibleEnRanking,
            idioma: usuario.preferencia.idioma,
          }
        : null,
      consentimientos: usuario.consentimientos.map((x) => ({
        tipo: x.tipo,
        version: x.version,
        aceptadoEn: x.aceptadoEn,
      })),
      reciclador: p
        ? {
            sobreMi: p.sobreMi,
            zona: p.zona?.nombre ?? null,
            nivel: p.nivel.nombre,
            kgTotal: num(p.kgTotal),
            puntos: p.puntos,
            puntosDeReciclaje: p.puntosReciclaje,
            rachaSemanas: p.rachaSemanas,
            operacionesCompletadas: p.operacionesCompletadas,
            codigoDeInvitacion: p.codigoInvitacion,
            materiales: usuario.materiales.map((m) => m.material.nombre),
          }
        : null,
      negocio: c
        ? {
            tipo: c.tipo,
            nombreComercial: c.nombreComercial,
            descripcion: c.descripcion,
            direccion: c.direccion,
            zona: c.zona?.nombre ?? null,
            telefonoDelNegocio: c.telefonoNegocio,
            whatsapp: c.whatsapp,
            plan: c.plan,
            planDesde: dia(c.planDesde),
            planHasta: dia(c.planHasta),
            verificacion: c.estadoVerificacion,
            disponibilidad: c.disponibilidad,
            horarios: c.horarios.map((h) => ({ dia: h.dia, abre: hora(h.abre), cierra: hora(h.cierra) })),
            metodosDePago: c.pagos.map((x) => x.metodo),
            fotos: c.fotos.length,
            ruta: c.paradas.map((x) => ({ zona: x.zona.nombre, desde: hora(x.desde), hasta: hora(x.hasta) })),
            precios: precios.map((x) => ({
              material: x.material.nombre,
              precioMinimoPorKg: num(x.precioMin),
              precioMaximoPorKg: num(x.precioMax),
              demanda: x.demanda,
              activo: x.activo,
              actualizadoEn: x.actualizadoEn,
            })),
            avisos,
            solicitudesDePlan: solicitudesPlan.map((x) => ({
              estado: x.estado,
              mensaje: x.mensaje,
              motivoDeLaDecision: x.motivoDecision,
              desde: dia(x.desde),
              hasta: dia(x.hasta),
              creadaEn: x.creadaEn,
            })),
          }
        : null,
      ubicacionesDeMisPublicaciones: ubicaciones.map((u) => ({
        publicacion: u.publicacion_id,
        lat: u.lat,
        lng: u.lng,
        origen: u.origen,
      })),
      publicaciones: publicaciones.map((x) => ({
        id: x.id,
        material: x.material.nombre,
        kg: num(x.cantidadKg),
        precioEsperadoPorKg: num(x.precioEsperado),
        nota: x.nota,
        estado: x.estado,
        motivoDeCancelacion: x.motivoCancelacion,
        creadaEn: x.creadaEn,
        venceEn: x.venceEn,
        fotos: x._count.fotos,
        ofertasRecibidas: x.ofertas.map((o) => ({
          negocio: o.comprador.nombreComercial,
          precioPorKg: num(o.precioKg),
          total: num(o.total),
          mensaje: o.mensaje,
          estado: o.estado,
          creadaEn: o.creadaEn,
        })),
      })),
      ofertasQueHice: ofertasHechas.map((o) => ({
        material: o.publicacion.material.nombre,
        kg: num(o.publicacion.cantidadKg),
        precioPorKg: num(o.precioKg),
        total: num(o.total),
        mensaje: o.mensaje,
        cuandoRecoge: o.cuandoRecoge,
        estado: o.estado,
        creadaEn: o.creadaEn,
      })),
      operaciones: operaciones.map((o) => ({
        id: o.id,
        estado: o.estado,
        material: o.publicacion.material.nombre,
        kgPublicados: num(o.publicacion.cantidadKg),
        kgFinales: num(o.kgFinal),
        montoFinal: num(o.montoFinal),
        reciclador: o.reciclador.nombre,
        negocio: o.comprador.nombreComercial,
        creadaEn: o.creadaEn,
        completadaEn: o.completadaEn,
        canceladaEn: o.canceladaEn,
        motivoDeCancelacion: o.motivoCancelacion,
        coordinacion: o.coordinacion
          ? { referencia: o.coordinacion.referencia, dia: dia(o.coordinacion.dia), mensaje: o.coordinacion.mensaje }
          : null,
      })),
      resenasEscritas: escritas,
      resenasRecibidas: recibidas.map((r) => ({
        operacion: r.operacionId,
        estrellas: r.estrellas,
        comentario: r.comentario,
        creadaEn: r.creadaEn,
        de: r.autor.nombre,
      })),
      reportesQueHice: reportes,
      puntos: {
        movimientos: movimientos.map((m) => ({ ...m, motivo: m.motivo })),
        giros,
        premios: premios.map((x) => ({
          premio: x.premio.nombre,
          tipo: x.premio.tipo,
          codigo: x.codigo,
          estado: x.estado,
          puntoDeEntrega: x.puntoEntrega,
          venceEn: x.venceEn,
          reclamadoEn: x.reclamadoEn,
          entregadoEn: x.entregadoEn,
          ganadoEn: x.creadoEn,
        })),
        insignias: insignias.map((i) => ({ insignia: i.insignia.nombre, obtenidaEn: i.obtenidaEn })),
        desafios: desafios.map((d) => ({
          desafio: d.desafio.plantilla.nombre,
          mes: dia(d.desafio.mes),
          progreso: num(d.progreso),
          completadoEn: d.completadoEn,
          reclamadoEn: d.reclamadoEn,
        })),
      },
      entregasDirectas: registros.map((r) => ({
        fecha: dia(r.fecha),
        negocio: r.comprador.nombreComercial,
        kgDeclarados: num(r.kg),
        kgConfirmados: num(r.kgConfirmado),
        estado: r.estado,
        puntos: r.puntosOtorgados,
      })),
      favoritos: favoritos.map((f) => ({
        negocio: f.comprador.nombreComercial,
        desde: f.creadoEn,
        alertaPrecio: f.alertaPrecio,
        alertaAvisos: f.alertaAvisos,
      })),
      busquedasGuardadas: busquedas,
      notificaciones,
    };
  }
}
