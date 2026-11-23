import { Injectable } from '@nestjs/common';
import type { EstadoMovil } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { calificacionPublica } from '../publicaciones/vistas.js';

const CAMBIO_ZONA_MS = 86_400_000;

// Inicio de un día y de un mes en hora de Lima (UTC-5, sin horario de verano)
function inicioEnLima(ahora: Date, unidad: 'dia' | 'mes'): Date {
  const [anio, mes, dia] = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).split('-');
  return new Date(`${anio}-${mes}-${unidad === 'dia' ? dia : '01'}T05:00:00.000Z`);
}

@Injectable()
export class MovilService {
  constructor(private readonly prisma: PrismaApi) {}

  // Pantalla 52: estado, zona de trabajo e indicadores reales (las compras se cierran en la Fase 7)
  async inicio(usuario: UsuarioSesion) {
    const compradorId = this.movil(usuario);
    const ahora = new Date();
    const [negocio, completadasHoy, completadasMes, enviadas, aceptadas] = await Promise.all([
      this.prisma.comprador.findUniqueOrThrow({
        where: { id: compradorId },
        select: {
          nombreComercial: true,
          disponibilidad: true,
          mostrarZona: true,
          compartePosicion: true,
          zonaActualizadaEn: true,
          califProm: true,
          califCant: true,
          zona: { select: { id: true, nombre: true } },
          usuario: { select: { ciudadId: true } },
        },
      }),
      this.prisma.operacion.aggregate({
        where: { compradorId, estado: 'COMPLETADA', completadaEn: { gte: inicioEnLima(ahora, 'dia') } },
        _count: true,
        _sum: { kgFinal: true },
      }),
      this.prisma.operacion.aggregate({
        where: { compradorId, estado: 'COMPLETADA', completadaEn: { gte: inicioEnLima(ahora, 'mes') } },
        _sum: { kgFinal: true },
      }),
      this.prisma.oferta.count({ where: { compradorId, estado: { not: 'RETIRADA' } } }),
      this.prisma.oferta.count({ where: { compradorId, estado: 'ACEPTADA' } }),
    ]);
    return {
      nombre: negocio.nombreComercial,
      ciudadId: negocio.usuario.ciudadId,
      disponibilidad: negocio.disponibilidad,
      mostrarZona: negocio.mostrarZona,
      compartePosicion: negocio.compartePosicion,
      zona: negocio.zona,
      zonaCambiableDesde: this.proximoCambio(negocio.zonaActualizadaEn, ahora),
      indicadores: {
        comprasHoy: completadasHoy._count,
        kgHoy: Number(completadasHoy._sum.kgFinal ?? 0),
        kgMes: Number(completadasMes._sum.kgFinal ?? 0),
        ofertasEnviadas: enviadas,
        ofertasAceptadas: aceptadas,
        calificacion: calificacionPublica(negocio.califProm, negocio.califCant),
      },
    };
  }

  // La zona es el punto de referencia de los tramos: cambiarla a cada rato permitiría acotar al reciclador
  async cambiarEstado(usuario: UsuarioSesion, datos: EstadoMovil) {
    const compradorId = this.movil(usuario);
    const actual = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { zonaId: true, zonaActualizadaEn: true, usuario: { select: { ciudadId: true } } },
    });
    const cambiaZona = datos.zonaId !== undefined && datos.zonaId !== actual.zonaId;
    if (cambiaZona) {
      const desde = this.proximoCambio(actual.zonaActualizadaEn, new Date());
      if (desde) {
        throw new ErrorNegocio(
          'ZONA_CAMBIADA_HOY',
          'Ya cambiaste tu zona de trabajo hoy. Podrás cambiarla de nuevo en 24 horas.',
          409,
        );
      }
      const zona = await this.prisma.zona.findFirst({
        where: { id: datos.zonaId, ciudadId: actual.usuario.ciudadId },
        select: { id: true },
      });
      if (!zona) {
        throw new ErrorNegocio('ZONA_NO_VALIDA', 'Elige una zona de tu ciudad.', 422, [
          { campo: 'zonaId', mensaje: 'Elige una zona de la lista.' },
        ]);
      }
    }
    await this.prisma.comprador.update({
      where: { id: compradorId },
      data: {
        ...(datos.disponibilidad ? { disponibilidad: datos.disponibilidad } : {}),
        // «En ruta» vale solo hoy; al salir de ese estado se apaga la posición compartida
        ...(datos.disponibilidad === 'EN_RUTA' ? { diaVigente: new Date(`${hoyEnLima()}T00:00:00Z`) } : {}),
        ...(datos.disponibilidad && datos.disponibilidad !== 'EN_RUTA' ? { compartePosicion: false } : {}),
        ...(datos.mostrarZona !== undefined ? { mostrarZona: datos.mostrarZona } : {}),
        ...(cambiaZona ? { zonaId: datos.zonaId, zonaActualizadaEn: new Date() } : {}),
      },
    });
    if (datos.disponibilidad && datos.disponibilidad !== 'EN_RUTA') {
      await this.prisma
        .$executeRaw`UPDATE comprador SET posicion_aproximada = NULL, posicion_actualizada_en = NULL WHERE id = ${compradorId}::uuid`;
    }
    return this.inicio(usuario);
  }

  private proximoCambio(ultimo: Date | null, ahora: Date): string | null {
    if (!ultimo) return null;
    const siguiente = ultimo.getTime() + CAMBIO_ZONA_MS;
    return siguiente > ahora.getTime() ? new Date(siguiente).toISOString() : null;
  }

  private movil(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
