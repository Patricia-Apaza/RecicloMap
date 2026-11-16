import { Injectable } from '@nestjs/common';
import type { RegistroNegocioCompleto } from '@reciclomap/shared';
import type { Prisma } from '../../generado/prisma/client.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { FotosService } from '../fotos/fotos.service.js';
import { NegociosRepositorio } from './negocios.repositorio.js';

const TIPO_POR_ROL = { CENTRO: 'CENTRO', COMPRADOR_MOVIL: 'MOVIL' } as const;
const SE_PUEDE_CORREGIR = new Set(['INFO_PEDIDA', 'RECHAZADO']);

@Injectable()
export class NegociosService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly repositorio: NegociosRepositorio,
    private readonly fotos: FotosService,
    private readonly configuracion: Configuracion,
  ) {}

  async estado(usuarioId: string) {
    const [borrador, comprador] = await Promise.all([
      this.prisma.compradorBorrador.findUnique({
        where: { usuarioId },
        select: { paso: true, datos: true, actualizadoEn: true },
      }),
      this.prisma.comprador.findUnique({
        where: { usuarioId },
        select: {
          id: true,
          tipo: true,
          nombreComercial: true,
          descripcion: true,
          direccion: true,
          zona: { select: { id: true, nombre: true } },
          whatsapp: true,
          telefonoNegocio: true,
          vehiculo: true,
          estadoVerificacion: true,
          ubicacionConfirmada: true,
          horaInicio: true,
          horaFin: true,
          horarios: { select: { dia: true, abre: true, cierra: true }, orderBy: { dia: 'asc' } },
          pagos: { select: { metodo: true } },
          precios: {
            where: { activo: true },
            select: {
              material: { select: { codigo: true, nombre: true } },
              precioMin: true,
              precioMax: true,
              demanda: true,
            },
          },
          fotos: { select: { archivoId: true }, orderBy: { orden: 'asc' } },
          verificaciones: {
            orderBy: { creadaEn: 'desc' },
            take: 1,
            select: { estado: true, motivo: true, mensaje: true, creadaEn: true, resueltaEn: true },
          },
        },
      }),
    ]);
    const { verificaciones, ...negocio } = comprador ?? { verificaciones: [] };
    const pin = comprador?.ubicacionConfirmada
      ? ((
          await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
              SELECT ST_Y(ubicacion::geometry) AS lat, ST_X(ubicacion::geometry) AS lng FROM comprador WHERE id = ${comprador.id}::uuid`
        )[0] ?? null)
      : null;
    return {
      borrador,
      negocio: comprador
        ? {
            ...negocio,
            horarios: comprador.horarios.map((fila) => ({
              dia: fila.dia,
              abre: fila.abre.toISOString().slice(11, 16),
              cierra: fila.cierra.toISOString().slice(11, 16),
            })),
            ubicacion: pin,
            horaInicio: comprador.horaInicio?.toISOString().slice(11, 16) ?? null,
            horaFin: comprador.horaFin?.toISOString().slice(11, 16) ?? null,
            pagos: comprador.pagos.map((fila) => fila.metodo),
            fotos: comprador.fotos.map((fila) => fila.archivoId),
            precios: comprador.precios.map((fila) => ({
              material: fila.material,
              min: fila.precioMin.toFixed(2),
              max: fila.precioMax.toFixed(2),
              demanda: fila.demanda,
            })),
          }
        : null,
      verificacion: verificaciones[0] ?? null,
    };
  }

  // El borrador se guarda mientras el negocio no se envía, o mientras está pendiente de corrección
  async guardarBorrador(usuario: UsuarioSesion, paso: number, datos: Record<string, unknown>) {
    if (usuario.compradorId) await this.exigirCorregible(usuario.compradorId);
    const json = datos as Prisma.InputJsonObject;
    return this.prisma.compradorBorrador.upsert({
      where: { usuarioId: usuario.id },
      create: { usuarioId: usuario.id, paso, datos: json },
      update: { paso, datos: json },
      select: { paso: true, datos: true, actualizadoEn: true },
    });
  }

  async enviar(usuario: UsuarioSesion, datos: RegistroNegocioCompleto) {
    if (usuario.compradorId) {
      throw new ErrorNegocio('NEGOCIO_YA_ENVIADO', 'Tu negocio ya fue enviado. Revisa su estado de verificación.', 409);
    }
    await this.validarContexto(usuario, datos);
    await this.prisma.$transaction(async (tx) => {
      const compradorId = await this.repositorio.crear(tx, usuario.id, datos);
      await tx.verificacion.create({ data: { compradorId, tipo: 'REGISTRO', estado: 'EN_REVISION' } });
      await tx.usuario.update({ where: { id: usuario.id }, data: { nombre: datos.nombreComercial, estado: 'ACTIVO' } });
      await tx.compradorBorrador.deleteMany({ where: { usuarioId: usuario.id } });
    });
    await this.fotos.limpiarSueltas(usuario.id);
    return this.estado(usuario.id);
  }

  async reenviar(usuario: UsuarioSesion, datos: RegistroNegocioCompleto) {
    if (!usuario.compradorId) {
      throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    }
    const ultima = await this.exigirCorregible(usuario.compradorId);
    await this.validarContexto(usuario, datos);
    const compradorId = usuario.compradorId;
    await this.prisma.$transaction(async (tx) => {
      await this.repositorio.actualizar(tx, compradorId, usuario.id, datos);
      // Un pedido de información vuelve a la cola; un rechazo abre una revisión nueva
      if (ultima.estado === 'INFO_PEDIDA') {
        await tx.verificacion.update({ where: { id: ultima.id }, data: { estado: 'EN_REVISION' } });
      } else {
        await tx.verificacion.create({ data: { compradorId, tipo: 'REGISTRO', estado: 'EN_REVISION' } });
      }
      await tx.usuario.update({ where: { id: usuario.id }, data: { nombre: datos.nombreComercial } });
      await tx.compradorBorrador.deleteMany({ where: { usuarioId: usuario.id } });
    });
    await this.fotos.limpiarSueltas(usuario.id);
    return this.estado(usuario.id);
  }

  private async exigirCorregible(compradorId: string) {
    const ultima = await this.prisma.verificacion.findFirst({
      where: { compradorId },
      orderBy: { creadaEn: 'desc' },
      select: { id: true, estado: true },
    });
    if (!ultima || !SE_PUEDE_CORREGIR.has(ultima.estado)) {
      throw new ErrorNegocio(
        'NO_SE_PUEDE_CORREGIR',
        'Solo puedes corregir tus datos cuando un administrador te lo pide o rechaza el registro.',
        409,
      );
    }
    return ultima;
  }

  private async validarContexto(usuario: UsuarioSesion, datos: RegistroNegocioCompleto): Promise<void> {
    const tipoEsperado = TIPO_POR_ROL[usuario.rol as keyof typeof TIPO_POR_ROL];
    if (datos.tipo !== tipoEsperado) {
      throw new ErrorNegocio('TIPO_DE_NEGOCIO', 'El tipo de negocio no coincide con tu cuenta.', 422);
    }
    await this.fotos.exigirFotosPropias(this.prisma, usuario.id, datos.fotos);
    const zona = await this.prisma.zona.findFirst({
      where: { id: datos.zonaId, ciudad: { usuarios: { some: { id: usuario.id } } } },
      select: { id: true },
    });
    if (!zona) {
      throw new ErrorNegocio('ZONA_NO_VALIDA', 'Elige una zona de tu ciudad.', 422, [
        { campo: 'zonaId', mensaje: 'Elige una zona de la lista.' },
      ]);
    }
    if (datos.tipo !== 'CENTRO') return;
    // Con el mapa disponible el pin es obligatorio; sin clave (solo fuera de producción) basta la zona
    if (!datos.ubicacion) {
      if (!this.configuracion.googleMaps.claveNavegador) return;
      throw new ErrorNegocio('PIN_REQUERIDO', 'Coloca el pin de tu local en el mapa.', 422, [
        { campo: 'ubicacion', mensaje: 'Coloca el pin de tu local en el mapa.' },
      ]);
    }
    const { ciudadId } = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { ciudadId: true },
    });
    await this.repositorio.exigirPinEnCiudad(this.prisma, ciudadId, datos.ubicacion);
  }
}
