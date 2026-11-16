import { Injectable } from '@nestjs/common';
import { CODIGOS_MATERIAL, type CodigoMaterial, NOMBRE_MATERIAL, type PreciosNegocio } from '@reciclomap/shared';
import type { Prisma } from '../../generado/prisma/client.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { MapaRepositorio, type Punto } from '../mapa/mapa.repositorio.js';
import { calcularSemaforo, semaforoConTexto } from '../mapa/semaforo.js';
import { NegociosRepositorio } from '../negocios/negocios.repositorio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

// "Tu precio frente al mercado": se compara con quienes compran el material a 5 km del negocio (2.3)
const RADIO_MERCADO_KM = 5;
// Un pin a más de 40 km de las zonas de su ciudad es un error de toque, no una dirección real
const DIA_MS = 86_400_000;

@Injectable()
export class PreciosService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly mapa: MapaRepositorio,
    private readonly negocios: NegociosRepositorio,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async misPrecios(usuario: UsuarioSesion) {
    const compradorId = this.exigirNegocio(usuario);
    const [negocio, filas, diasAlDia, referencia] = await Promise.all([
      this.prisma.comprador.findUniqueOrThrow({
        where: { id: compradorId },
        select: { tipo: true, ubicacionConfirmada: true },
      }),
      this.prisma.precioMaterial.findMany({
        where: { compradorId },
        select: {
          id: true,
          activo: true,
          precioMin: true,
          precioMax: true,
          demanda: true,
          actualizadoEn: true,
          material: { select: { codigo: true } },
          moderaciones: {
            where: { cerradaEn: null },
            orderBy: { creadaEn: 'desc' },
            take: 1,
            select: { estado: true, motivo: true, plazoHasta: true },
          },
        },
      }),
      this.mapa.diasPrecioAlDia(),
      this.puntoDelNegocio(compradorId),
    ]);
    const ahora = Date.now();

    const materiales = await Promise.all(
      CODIGOS_MATERIAL.map(async (codigo) => {
        const fila = filas.find((precio) => precio.material.codigo === codigo);
        const base = { material: { codigo, nombre: NOMBRE_MATERIAL[codigo] } };
        if (!fila || !fila.activo) {
          return {
            ...base,
            activo: false,
            min: null,
            max: null,
            demanda: fila?.demanda ?? 'MEDIA',
            actualizadoEn: null,
            antiguo: false,
            semaforo: null,
            moderacion: null,
          };
        }
        const moderacion = fila.moderaciones[0] ?? null;
        return {
          ...base,
          activo: true,
          min: fila.precioMin.toFixed(2),
          max: fila.precioMax.toFixed(2),
          demanda: fila.demanda,
          actualizadoEn: fila.actualizadoEn.toISOString(),
          antiguo: ahora - fila.actualizadoEn.getTime() > diasAlDia * DIA_MS,
          // Un precio con la visibilidad suspendida no aparece en el mapa, así que no se compara
          semaforo:
            moderacion?.estado === 'SUSPENDIDO' ? null : await this.semaforoPropio(compradorId, codigo, referencia),
          moderacion: moderacion
            ? {
                estado: moderacion.estado,
                motivo: moderacion.motivo,
                plazoHasta: moderacion.plazoHasta?.toISOString() ?? null,
              }
            : null,
        };
      }),
    );
    return {
      tipo: negocio.tipo,
      ubicacionConfirmada: negocio.tipo === 'MOVIL' || negocio.ubicacionConfirmada,
      diasPrecioAlDia: diasAlDia,
      radioMercadoKm: RADIO_MERCADO_KM,
      materiales,
    };
  }

  // Única ruta que cambia un precio: el dueño, verificado, dentro de los límites; la base escribe el historial
  async guardar(usuario: UsuarioSesion, precios: PreciosNegocio) {
    const compradorId = this.exigirNegocio(usuario);
    await this.prisma.$transaction(async (tx) => {
      const antes = await tx.precioMaterial.findMany({
        where: { compradorId },
        select: { activo: true, precioMin: true, precioMax: true, material: { select: { codigo: true } } },
      });
      await this.negocios.guardarPrecios(tx, compradorId, usuario.id, precios);
      await this.avisarFavoritos(tx, compradorId, antes, precios);
    });
    return this.misPrecios(usuario);
  }

  async historial(usuario: UsuarioSesion) {
    const compradorId = this.exigirNegocio(usuario);
    const filas = await this.prisma.historialPrecio.findMany({
      where: { precioMaterial: { compradorId } },
      orderBy: { cambiadoEn: 'desc' },
      take: 30,
      select: {
        precioMin: true,
        precioMax: true,
        cambiadoEn: true,
        precioMaterial: { select: { material: { select: { codigo: true, nombre: true } } } },
      },
    });
    return {
      datos: filas.map((fila) => ({
        material: fila.precioMaterial.material,
        min: fila.precioMin.toFixed(2),
        max: fila.precioMax.toFixed(2),
        cambiadoEn: fila.cambiadoEn.toISOString(),
      })),
    };
  }

  // Pin del centro: se coloca una vez; moverlo después pasará por una nueva verificación
  async colocarPin(usuario: UsuarioSesion, ubicacion: Punto) {
    const compradorId = this.exigirNegocio(usuario);
    const negocio = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { tipo: true, ubicacionConfirmada: true, usuario: { select: { ciudadId: true } } },
    });
    if (negocio.tipo !== 'CENTRO') {
      throw new ErrorNegocio('SOLO_CENTROS', 'El comprador móvil se ubica por su zona de trabajo, no con un pin.', 422);
    }
    if (negocio.ubicacionConfirmada) {
      throw new ErrorNegocio(
        'PIN_YA_COLOCADO',
        'Tu local ya tiene su pin. Para moverlo, solicita el cambio de dirección en Datos y horarios.',
        409,
      );
    }
    await this.negocios.exigirPinEnCiudad(this.prisma, negocio.usuario.ciudadId, ubicacion);
    await this.prisma.$executeRaw`
      UPDATE comprador
         SET ubicacion = ST_SetSRID(ST_MakePoint(${ubicacion.lng}::float8, ${ubicacion.lat}::float8), 4326)::geography,
             ubicacion_confirmada = true,
             actualizado_en = now()
       WHERE id = ${compradorId}::uuid`;
    return { ubicacionConfirmada: true };
  }

  // Pantalla 19: solo quienes lo guardaron en favoritos y dejaron activa la alerta de precio
  private async avisarFavoritos(
    tx: ClienteBd,
    compradorId: string,
    antes: Array<{
      activo: boolean;
      precioMin: Prisma.Decimal;
      precioMax: Prisma.Decimal;
      material: { codigo: string };
    }>,
    precios: PreciosNegocio,
  ): Promise<void> {
    const cambios = CODIGOS_MATERIAL.flatMap((codigo) => {
      const nuevo = precios[codigo];
      if (!nuevo) return [];
      const previo = antes.find((fila) => fila.material.codigo === codigo);
      const min = nuevo.min.toFixed(2);
      const max = nuevo.max.toFixed(2);
      if (previo?.activo && previo.precioMin.toFixed(2) === min && previo.precioMax.toFixed(2) === max) return [];
      return [`${NOMBRE_MATERIAL[codigo]} a S/ ${min}–${max}`];
    });
    if (cambios.length === 0) return;
    const negocio = await tx.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { nombreComercial: true, estadoVerificacion: true },
    });
    if (negocio.estadoVerificacion !== 'APROBADO') return;
    const seguidores = await tx.favorito.findMany({
      where: { compradorId, alertaPrecio: true },
      select: { usuarioId: true },
    });
    for (const { usuarioId } of seguidores) {
      await this.notificaciones.crear(tx, {
        usuarioId,
        tipo: 'PRECIO',
        titulo: `${negocio.nombreComercial} cambió sus precios`,
        mensaje: `Ahora paga ${cambios.join(', ')} por kg.`.slice(0, 200),
        enlace: `/negocios/${compradorId}`,
      });
    }
  }

  private async semaforoPropio(compradorId: string, codigo: CodigoMaterial, referencia: Punto | null) {
    if (!referencia) return null;
    const conjunto = await this.mapa.opcionesCercanas(codigo, referencia, RADIO_MERCADO_KM);
    // Solo la etiqueta y cuántos se compararon: nunca los nombres ni los precios de los demás
    if (!conjunto.some((fila) => fila.id === compradorId)) return null;
    const semaforo = calcularSemaforo(conjunto.map((fila) => ({ id: fila.id, min: fila.min, max: fila.max })));
    return semaforoConTexto(semaforo.get(compradorId) ?? 'SIN_COMPARACION', conjunto.length);
  }

  private async puntoDelNegocio(compradorId: string): Promise<Punto | null> {
    const filas = await this.prisma.$queryRaw<Punto[]>`
      SELECT ST_Y(p::geometry) AS lat, ST_X(p::geometry) AS lng FROM comprador_punto_referencia(${compradorId}::uuid) AS p WHERE p IS NOT NULL`;
    return filas[0] ?? null;
  }

  private exigirNegocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
