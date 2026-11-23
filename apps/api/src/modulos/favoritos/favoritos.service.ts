import { Injectable } from '@nestjs/common';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { MapaService, type Referencia } from '../mapa/mapa.service.js';
import type { UbicacionSolicitud } from '../mapa/posicion.js';

const MAXIMO_FAVORITOS = 30;
// El semáforo de cada favorito compara con todos los que compran ese material cerca, no solo con los favoritos
const RADIO_FAVORITOS_KM = 5;

// Pantalla 19: los favoritos del reciclador y sus alertas opcionales (única vía de alertas de precio)
@Injectable()
export class FavoritosService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly mapa: MapaService,
  ) {}

  async listar(usuario: UsuarioSesion, ubicacion: UbicacionSolicitud) {
    const [filas, referencia] = await Promise.all([
      this.prisma.favorito.findMany({
        where: { usuarioId: usuario.id },
        orderBy: { creadoEn: 'desc' },
        select: {
          compradorId: true,
          alertaPrecio: true,
          alertaAvisos: true,
          creadoEn: true,
          comprador: { select: { nombreComercial: true, tipo: true } },
        },
      }),
      this.referencia(usuario, ubicacion),
    ]);
    const datos = await Promise.all(
      filas.map(async (fila) => {
        const base = {
          id: fila.compradorId,
          alertas: { precio: fila.alertaPrecio, avisos: fila.alertaAvisos },
          guardadoEn: fila.creadoEn.toISOString(),
        };
        try {
          const detalle = await this.mapa.detalle(fila.compradorId, RADIO_FAVORITOS_KM, referencia, undefined);
          return { ...base, visible: true as const, negocio: detalle };
        } catch (error) {
          if (error instanceof ErrorNegocio && error.estado === 404) {
            // Suspendido, sin precios visibles o fuera del mapa: se avisa sin mostrar precios
            return {
              ...base,
              visible: false as const,
              negocio: { id: fila.compradorId, nombre: fila.comprador.nombreComercial, tipo: fila.comprador.tipo },
            };
          }
          throw error;
        }
      }),
    );
    return { radioKm: RADIO_FAVORITOS_KM, referencia: referencia?.origen ?? null, datos };
  }

  async ids(usuario: UsuarioSesion) {
    const filas = await this.prisma.favorito.findMany({
      where: { usuarioId: usuario.id },
      select: { compradorId: true },
    });
    return { ids: filas.map((fila) => fila.compradorId) };
  }

  async guardar(usuario: UsuarioSesion, compradorId: string) {
    const visible = await this.prisma.comprador.count({
      where: { id: compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
    });
    if (!visible) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio en el mapa.', 404);
    const existente = await this.prisma.favorito.findUnique({
      where: { usuarioId_compradorId: { usuarioId: usuario.id, compradorId } },
      select: { compradorId: true },
    });
    if (existente) return { favorito: true };
    if ((await this.prisma.favorito.count({ where: { usuarioId: usuario.id } })) >= MAXIMO_FAVORITOS) {
      throw new ErrorNegocio('LIMITE_FAVORITOS', `Puedes guardar hasta ${MAXIMO_FAVORITOS} favoritos.`, 422);
    }
    await this.prisma.favorito.create({ data: { usuarioId: usuario.id, compradorId } });
    return { favorito: true };
  }

  async quitar(usuario: UsuarioSesion, compradorId: string): Promise<void> {
    await this.prisma.favorito.deleteMany({ where: { usuarioId: usuario.id, compradorId } });
  }

  async alertas(
    usuario: UsuarioSesion,
    compradorId: string,
    cambio: { alertaPrecio?: boolean; alertaAvisos?: boolean },
  ) {
    const resultado = await this.prisma.favorito.updateMany({
      where: { usuarioId: usuario.id, compradorId },
      data: cambio,
    });
    if (resultado.count === 0) throw new ErrorNegocio('NO_ENCONTRADO', 'Ese negocio no está en tus favoritos.', 404);
    const fila = await this.prisma.favorito.findUniqueOrThrow({
      where: { usuarioId_compradorId: { usuarioId: usuario.id, compradorId } },
      select: { alertaPrecio: true, alertaAvisos: true },
    });
    return { id: compradorId, alertas: { precio: fila.alertaPrecio, avisos: fila.alertaAvisos } };
  }

  // Sin cabeceras, se mide desde la zona del perfil del reciclador
  private async referencia(usuario: UsuarioSesion, ubicacion: UbicacionSolicitud): Promise<Referencia | null> {
    if (ubicacion.posicion || ubicacion.zonaId)
      return this.mapa.puntoDeReferencia(ubicacion.posicion, ubicacion.zonaId);
    const perfil = await this.prisma.recicladorPerfil.findUnique({
      where: { usuarioId: usuario.id },
      select: { zonaId: true },
    });
    return perfil?.zonaId ? this.mapa.puntoDeReferencia(undefined, perfil.zonaId).catch(() => null) : null;
  }
}
