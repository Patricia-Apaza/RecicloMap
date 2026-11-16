import { Injectable } from '@nestjs/common';
import { type esquemaBusquedaGuardada, esquemaFiltrosMapa, MAXIMO_BUSQUEDAS } from '@reciclomap/shared';
import type { z } from 'zod';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

type NuevaBusqueda = z.infer<typeof esquemaBusquedaGuardada>;

@Injectable()
export class BusquedasService {
  constructor(private readonly prisma: PrismaApi) {}

  async listar(usuarioId: string) {
    const filas = await this.prisma.busquedaGuardada.findMany({
      where: { usuarioId },
      orderBy: { creadaEn: 'desc' },
      select: { id: true, nombre: true, filtros: true, creadaEn: true },
    });
    // Una búsqueda guardada con un formato anterior se descarta en lugar de romper la pantalla
    return {
      datos: filas.flatMap((fila) => {
        const filtros = esquemaFiltrosMapa.safeParse(fila.filtros);
        return filtros.success ? [{ ...fila, filtros: filtros.data, creadaEn: fila.creadaEn.toISOString() }] : [];
      }),
    };
  }

  async guardar(usuarioId: string, busqueda: NuevaBusqueda) {
    const total = await this.prisma.busquedaGuardada.count({ where: { usuarioId } });
    if (total >= MAXIMO_BUSQUEDAS) {
      throw new ErrorNegocio(
        'DEMASIADAS_BUSQUEDAS',
        `Puedes guardar hasta ${MAXIMO_BUSQUEDAS} búsquedas. Borra una para guardar otra.`,
        409,
      );
    }
    const fila = await this.prisma.busquedaGuardada.create({
      data: { usuarioId, nombre: busqueda.nombre, filtros: busqueda.filtros },
      select: { id: true, nombre: true, filtros: true, creadaEn: true },
    });
    return { ...fila, creadaEn: fila.creadaEn.toISOString() };
  }

  async borrar(usuarioId: string, id: string) {
    const borradas = await this.prisma.busquedaGuardada.deleteMany({ where: { id, usuarioId } });
    if (borradas.count === 0) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa búsqueda.', 404);
  }
}
