import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { type RutaDia, redondearPosicion } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { NegociosRepositorio } from '../negocios/negocios.repositorio.js';

const hora = (texto: string) => new Date(`1970-01-01T${texto}:00.000Z`);
const texto = (fecha: Date) => fecha.toISOString().slice(11, 16);

// Pantalla 56 y posición del día. Todo lo "de hoy" caduca al terminar el día en America/Lima
@Injectable()
export class DiaMovilService {
  private readonly registro = new Logger('DiaMovil');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly negocios: NegociosRepositorio,
  ) {}

  async ruta(usuario: UsuarioSesion, ahora: Date = new Date()) {
    const compradorId = this.movil(usuario);
    const hoy = hoyEnLima(ahora);
    const negocio = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: {
        rutaPublicada: true,
        diaVigente: true,
        paradas: {
          orderBy: { orden: 'asc' },
          select: { zonaId: true, desde: true, hasta: true, zona: { select: { nombre: true } } },
        },
      },
    });
    const vigente = negocio.diaVigente?.toISOString().slice(0, 10) === hoy;
    return {
      fecha: hoy,
      publicada: vigente && negocio.rutaPublicada,
      paradas: vigente
        ? negocio.paradas.map((p) => ({
            zonaId: p.zonaId,
            zona: p.zona.nombre,
            desde: texto(p.desde),
            hasta: texto(p.hasta),
          }))
        : [],
    };
  }

  // La ruta de hoy reemplaza a la anterior; no se conserva historial
  async guardarRuta(usuario: UsuarioSesion, datos: RutaDia, ahora: Date = new Date()) {
    const compradorId = this.movil(usuario);
    const ciudad = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { usuario: { select: { ciudadId: true } } },
    });
    const zonas = await this.prisma.zona.count({
      where: { id: { in: datos.paradas.map((p) => p.zonaId) }, ciudadId: ciudad.usuario.ciudadId },
    });
    if (zonas !== datos.paradas.length) {
      throw new ErrorNegocio('ZONA_NO_VALIDA', 'Elige zonas de tu ciudad.', 422, [
        { campo: 'paradas', mensaje: 'Revisa las zonas.' },
      ]);
    }
    if (datos.publicar && datos.paradas.length === 0) {
      throw new ErrorNegocio('RUTA_VACIA', 'Agrega al menos una zona para publicar tu ruta.', 422, [
        { campo: 'paradas', mensaje: 'Agrega al menos una zona.' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.paradaRuta.deleteMany({ where: { compradorId } });
      await tx.paradaRuta.createMany({
        data: datos.paradas.map((p, orden) => ({
          compradorId,
          zonaId: p.zonaId,
          desde: hora(p.desde),
          hasta: hora(p.hasta),
          orden,
        })),
      });
      await tx.comprador.update({
        where: { id: compradorId },
        data: {
          rutaPublicada: datos.publicar && datos.paradas.length > 0,
          diaVigente: new Date(`${hoyEnLima(ahora)}T00:00:00Z`),
        },
      });
    });
    return this.ruta(usuario, ahora);
  }

  // La posición se redondea aquí, en el servidor, y se guarda un solo punto: sin historial
  async compartirPosicion(
    usuario: UsuarioSesion,
    datos: { comparte: boolean; posicion?: { lat: number; lng: number } | null },
    ahora: Date = new Date(),
  ) {
    const compradorId = this.movil(usuario);
    const negocio = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { disponibilidad: true, usuario: { select: { ciudadId: true } } },
    });
    if (!datos.comparte || !datos.posicion) {
      await this.prisma.$executeRaw`
        UPDATE comprador SET posicion_aproximada = NULL, posicion_actualizada_en = NULL, comparte_posicion = false
         WHERE id = ${compradorId}::uuid`;
      return { comparte: false, posicion: null };
    }
    if (negocio.disponibilidad !== 'EN_RUTA') {
      throw new ErrorNegocio('NO_EN_RUTA', 'Solo puedes compartir tu posición cuando estás «En ruta».', 409);
    }
    await this.negocios.exigirPinEnCiudad(this.prisma, negocio.usuario.ciudadId, datos.posicion);
    const [lat, lng] = redondearPosicion(datos.posicion.lat, datos.posicion.lng).split(',').map(Number) as [
      number,
      number,
    ];
    await this.prisma.$executeRaw`
      UPDATE comprador
         SET posicion_aproximada = ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
             posicion_actualizada_en = ${ahora}, comparte_posicion = true, dia_vigente = ${hoyEnLima(ahora)}::date
       WHERE id = ${compradorId}::uuid`;
    return { comparte: true, posicion: { lat, lng } };
  }

  // Al terminar el día en Lima: el estado «En ruta», la ruta y la posición compartida se apagan solos
  @Cron('*/10 * * * *', { name: 'caducar-dia-movil', timeZone: 'America/Lima' })
  async ejecutar(): Promise<void> {
    const caducados = await this.caducarDia();
    if (caducados > 0) this.registro.log(`Se cerró el día de ${caducados} compradores móviles.`);
  }

  async caducarDia(ahora: Date = new Date()): Promise<number> {
    const hoy = hoyEnLima(ahora);
    return this.prisma.$transaction(async (tx) => {
      const vencidos = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM comprador
         WHERE tipo = 'MOVIL'
           AND (dia_vigente IS NULL OR dia_vigente < ${hoy}::date)
           AND (disponibilidad = 'EN_RUTA' OR ruta_publicada OR comparte_posicion OR posicion_aproximada IS NOT NULL)
         FOR UPDATE`;
      if (vencidos.length === 0) return 0;
      const ids = vencidos.map((v) => v.id);
      await tx.paradaRuta.deleteMany({ where: { compradorId: { in: ids } } });
      await tx.$executeRaw`
        UPDATE comprador
           SET disponibilidad = CASE WHEN disponibilidad = 'EN_RUTA' THEN 'DISPONIBLE'::disponibilidad ELSE disponibilidad END,
               ruta_publicada = false, comparte_posicion = false, posicion_aproximada = NULL, posicion_actualizada_en = NULL
         WHERE id = ANY(${ids}::uuid[])`;
      return ids.length;
    });
  }

  private movil(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
