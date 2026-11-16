import { Injectable } from '@nestjs/common';
import type {
  esquemaCambioDireccion,
  esquemaDatosNegocio,
  esquemaHorariosNegocio,
  METODOS_PAGO,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { esViolacionUnica } from '../publicaciones/publicaciones.repositorio.js';
import { NegociosRepositorio } from './negocios.repositorio.js';

const hora = (texto: string) => new Date(`1970-01-01T${texto}:00.000Z`);
const texto = (fecha: Date | null) => fecha?.toISOString().slice(11, 16) ?? null;

// Pantalla 47: datos, horario y pagos se guardan al momento; la dirección o el pin pasan por el administrador (S5)
@Injectable()
export class DatosNegocioService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly repositorio: NegociosRepositorio,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async leer(usuario: UsuarioSesion) {
    const compradorId = this.negocio(usuario);
    const [fila, posicion] = await Promise.all([
      this.prisma.comprador.findUniqueOrThrow({
        where: { id: compradorId },
        select: {
          tipo: true,
          nombreComercial: true,
          descripcion: true,
          whatsapp: true,
          telefonoNegocio: true,
          vehiculo: true,
          direccion: true,
          estadoVerificacion: true,
          ubicacionConfirmada: true,
          horaInicio: true,
          horaFin: true,
          zona: { select: { id: true, nombre: true } },
          horarios: { select: { dia: true, abre: true, cierra: true }, orderBy: { dia: 'asc' } },
          pagos: { select: { metodo: true } },
          verificaciones: {
            where: { tipo: 'CAMBIO_DIRECCION' },
            orderBy: { creadaEn: 'desc' },
            take: 1,
            select: { estado: true, cambios: true, motivo: true, mensaje: true, creadaEn: true, resueltaEn: true },
          },
        },
      }),
      this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lng
          FROM comprador WHERE id = ${compradorId}::uuid AND ubicacion IS NOT NULL`,
    ]);
    const cambio = fila.verificaciones[0] ?? null;
    return {
      tipo: fila.tipo,
      estadoVerificacion: fila.estadoVerificacion,
      nombreComercial: fila.nombreComercial,
      descripcion: fila.descripcion,
      whatsapp: fila.whatsapp,
      telefonoNegocio: fila.telefonoNegocio,
      vehiculo: fila.vehiculo,
      direccion: fila.direccion,
      zona: fila.zona,
      // La posición del centro ya es pública en el mapa
      ubicacion: fila.tipo === 'CENTRO' && fila.ubicacionConfirmada ? (posicion[0] ?? null) : null,
      horario: {
        dias: fila.horarios.map((h) => ({ dia: h.dia, abre: texto(h.abre)!, cierra: texto(h.cierra)! })),
        habitual:
          fila.horaInicio && fila.horaFin ? { abre: texto(fila.horaInicio)!, cierra: texto(fila.horaFin)! } : null,
      },
      pagos: fila.pagos.map((p) => p.metodo),
      cambioDireccion: cambio
        ? {
            estado: cambio.estado,
            cambios: cambio.cambios as {
              direccion: string;
              zona: string;
              ubicacion: { lat: number; lng: number } | null;
            },
            motivo: cambio.motivo,
            mensaje: cambio.mensaje,
            creadaEn: cambio.creadaEn.toISOString(),
            resueltaEn: cambio.resueltaEn?.toISOString() ?? null,
          }
        : null,
    };
  }

  async guardarDatos(usuario: UsuarioSesion, datos: z.infer<typeof esquemaDatosNegocio>) {
    const compradorId = this.negocio(usuario);
    const actual = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { tipo: true },
    });
    if (actual.tipo === 'MOVIL' && !datos.vehiculo) {
      throw new ErrorNegocio('DATOS_NO_VALIDOS', 'Elige tu vehículo.', 400, [
        { campo: 'vehiculo', mensaje: 'Elige tu vehículo.' },
      ]);
    }
    await this.prisma.comprador.update({
      where: { id: compradorId },
      data: {
        nombreComercial: datos.nombreComercial,
        descripcion: datos.descripcion || null,
        whatsapp: datos.whatsapp,
        telefonoNegocio: actual.tipo === 'CENTRO' ? (datos.telefonoNegocio ?? null) : null,
        vehiculo: actual.tipo === 'MOVIL' ? datos.vehiculo : null,
      },
    });
    return this.leer(usuario);
  }

  async guardarHorarios(usuario: UsuarioSesion, datos: z.infer<typeof esquemaHorariosNegocio>) {
    const compradorId = this.negocio(usuario);
    const { tipo } = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { tipo: true },
    });
    if (tipo === 'CENTRO' && datos.dias.length === 0) {
      throw new ErrorNegocio('DATOS_NO_VALIDOS', 'Marca al menos un día de atención.', 400, [
        { campo: 'dias', mensaje: 'Marca al menos un día.' },
      ]);
    }
    if (tipo === 'MOVIL' && !datos.habitual) {
      throw new ErrorNegocio('DATOS_NO_VALIDOS', 'Indica tu horario habitual.', 400, [
        { campo: 'habitual', mensaje: 'Indica tu horario.' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.compradorHorario.deleteMany({ where: { compradorId } });
      if (tipo === 'CENTRO') {
        await tx.compradorHorario.createMany({
          data: datos.dias.map((d) => ({ compradorId, dia: d.dia, abre: hora(d.abre), cierra: hora(d.cierra) })),
        });
      }
      await tx.comprador.update({
        where: { id: compradorId },
        data:
          tipo === 'MOVIL' && datos.habitual
            ? { horaInicio: hora(datos.habitual.abre), horaFin: hora(datos.habitual.cierra) }
            : { horaInicio: null, horaFin: null },
      });
    });
    return this.leer(usuario);
  }

  async guardarPagos(usuario: UsuarioSesion, pagos: Array<(typeof METODOS_PAGO)[number]>) {
    const compradorId = this.negocio(usuario);
    const { tipo } = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { tipo: true },
    });
    if (tipo === 'CENTRO' && pagos.length === 0) {
      throw new ErrorNegocio('DATOS_NO_VALIDOS', 'Elige al menos un medio de pago.', 400, [
        { campo: 'pagos', mensaje: 'Elige al menos uno.' },
      ]);
    }
    await this.prisma.$transaction([
      this.prisma.compradorPago.deleteMany({ where: { compradorId } }),
      this.prisma.compradorPago.createMany({ data: [...new Set(pagos)].map((metodo) => ({ compradorId, metodo })) }),
    ]);
    return this.leer(usuario);
  }

  // Mientras el administrador decide, el centro sigue visible con la dirección anterior
  async pedirCambioDireccion(usuario: UsuarioSesion, datos: z.infer<typeof esquemaCambioDireccion>) {
    const compradorId = this.negocio(usuario);
    const negocio = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { tipo: true, estadoVerificacion: true, nombreComercial: true, usuario: { select: { ciudadId: true } } },
    });
    if (negocio.tipo !== 'CENTRO') {
      throw new ErrorNegocio(
        'SOLO_CENTROS',
        'El comprador móvil se ubica por su zona de trabajo, no por una dirección.',
        422,
      );
    }
    if (negocio.estadoVerificacion !== 'APROBADO') {
      throw new ErrorNegocio(
        'NEGOCIO_NO_VERIFICADO',
        'Corrige la dirección en tu registro mientras está en revisión.',
        409,
      );
    }
    const zona = await this.prisma.zona.findFirst({
      where: { id: datos.zonaId, ciudadId: negocio.usuario.ciudadId },
      select: { nombre: true },
    });
    if (!zona) throw new ErrorNegocio('ZONA_NO_VALIDA', 'Elige una zona de tu ciudad.', 422);
    if (datos.ubicacion)
      await this.repositorio.exigirPinEnCiudad(this.prisma, negocio.usuario.ciudadId, datos.ubicacion);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.verificacion.create({
          data: {
            compradorId,
            tipo: 'CAMBIO_DIRECCION',
            estado: 'EN_REVISION',
            cambios: {
              direccion: datos.direccion,
              zonaId: datos.zonaId,
              zona: zona.nombre,
              ubicacion: datos.ubicacion ?? null,
            },
          },
        });
        const admins = await tx.usuario.findMany({ where: { rol: 'ADMIN', estado: 'ACTIVO' }, select: { id: true } });
        for (const admin of admins) {
          await this.notificaciones.crear(tx, {
            usuarioId: admin.id,
            tipo: 'AVISO',
            titulo: 'Solicitud de cambio de dirección',
            mensaje: `${negocio.nombreComercial} pidió cambiar su dirección a ${datos.direccion}.`.slice(0, 200),
            enlace: '/admin/verificaciones',
            obligatoria: true,
          });
        }
      });
    } catch (error) {
      if (esViolacionUnica(error)) {
        throw new ErrorNegocio(
          'CAMBIO_EN_REVISION',
          'Ya tienes una solicitud en revisión. Espera la respuesta del administrador.',
          409,
        );
      }
      throw error;
    }
    return this.leer(usuario);
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
