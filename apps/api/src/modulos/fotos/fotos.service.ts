import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { PropositoArchivo } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { Almacen } from './almacen.js';
import { procesarFoto } from './procesar-foto.js';

export type PropositoSubida = Extract<PropositoArchivo, 'PERFIL' | 'NEGOCIO' | 'PUBLICACION'>;
export type TamanoFoto = 'completa' | 'mini';

// Tres en el negocio y tres de reemplazo mientras se corrige el registro
const MAXIMO_FOTOS_NEGOCIO_PROPIAS = 6;
// Tres por publicación y tres de reemplazo mientras se edita
const MAXIMO_FOTOS_PUBLICACION_SUELTAS = 6;
const ROLES_NEGOCIO = new Set(['CENTRO', 'COMPRADOR_MOVIL']);
const TIPO = 'image/webp';

type ArchivoGuardado = { id: string; clave: string; claveMiniatura: string | null };

@Injectable()
export class FotosService {
  private readonly registro = new Logger('Fotos');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly almacen: Almacen,
  ) {}

  async subir(usuario: UsuarioSesion, proposito: PropositoSubida, original: Buffer) {
    if (proposito === 'NEGOCIO') {
      if (!ROLES_NEGOCIO.has(usuario.rol)) {
        throw new ErrorNegocio('SIN_PERMISO', 'Solo los negocios suben fotos del local.', 403);
      }
      const propias = await this.prisma.archivo.count({ where: { propietarioId: usuario.id, proposito: 'NEGOCIO' } });
      if (propias >= MAXIMO_FOTOS_NEGOCIO_PROPIAS) {
        throw new ErrorNegocio('DEMASIADAS_FOTOS', 'Ya tienes demasiadas fotos. Quita una antes de subir otra.', 409);
      }
    }
    if (proposito === 'PUBLICACION') {
      if (usuario.rol !== 'RECICLADOR') {
        throw new ErrorNegocio('SIN_PERMISO', 'Solo los recicladores suben fotos de su material.', 403);
      }
      const sueltas = await this.prisma.archivo.count({
        where: { propietarioId: usuario.id, proposito: 'PUBLICACION', fotosPublicacion: { none: {} } },
      });
      if (sueltas >= MAXIMO_FOTOS_PUBLICACION_SUELTAS) {
        throw new ErrorNegocio(
          'DEMASIADAS_FOTOS',
          'Ya tienes demasiadas fotos sin publicar. Quita una antes de subir otra.',
          409,
        );
      }
    }

    const procesada = await procesarFoto(original);
    const id = randomUUID();
    const clave = `fotos/${id}.webp`;
    const claveMiniatura = `fotos/${id}-mini.webp`;
    await this.almacen.guardar(clave, procesada.foto, TIPO);
    await this.almacen.guardar(claveMiniatura, procesada.miniatura, TIPO);

    try {
      const anterior = await this.prisma.$transaction(async (tx) => {
        await tx.archivo.create({
          data: {
            id,
            propietarioId: usuario.id,
            proposito,
            clave,
            claveMiniatura,
            tipoMime: TIPO,
            bytes: procesada.foto.length,
          },
        });
        if (proposito !== 'PERFIL') return null;
        const actual = await tx.usuario.findUniqueOrThrow({
          where: { id: usuario.id },
          select: { foto: { select: { id: true, clave: true, claveMiniatura: true } } },
        });
        await tx.usuario.update({ where: { id: usuario.id }, data: { fotoId: id } });
        if (actual.foto) await tx.archivo.delete({ where: { id: actual.foto.id } });
        return actual.foto;
      });
      if (anterior) await this.borrarObjetos(anterior);
    } catch (error) {
      await this.borrarObjetos({ id, clave, claveMiniatura });
      throw error;
    }
    return { id, proposito, ancho: procesada.ancho, alto: procesada.alto, bytes: procesada.foto.length };
  }

  // La ven su dueño y la administración; las de un negocio verificado son públicas (15);
  // las de una publicación, los negocios verificados de su ciudad (42 y 44)
  async leer(usuario: UsuarioSesion | undefined, id: string, tamano: TamanoFoto): Promise<Buffer> {
    const archivo = await this.prisma.archivo.findUnique({
      where: { id },
      select: {
        propietarioId: true,
        clave: true,
        claveMiniatura: true,
        fotosNegocio: {
          where: { comprador: { estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } } },
          select: { id: true },
        },
        fotosPublicacion: { select: { publicacion: { select: { ciudadId: true } } } },
      },
    });
    const propia = usuario && (archivo?.propietarioId === usuario.id || usuario.rol === 'ADMIN');
    const deMiCiudad =
      archivo?.fotosPublicacion.length && usuario?.negocioVerificado
        ? await this.mismaCiudad(usuario.id, archivo.fotosPublicacion[0]!.publicacion.ciudadId)
        : false;
    if (!archivo || !(propia || archivo.fotosNegocio.length > 0 || deMiCiudad)) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa foto.', 404);
    }
    return this.almacen.leer(tamano === 'mini' && archivo.claveMiniatura ? archivo.claveMiniatura : archivo.clave);
  }

  // Una foto ya enviada a revisión no se borra suelta: se cambia al corregir el registro
  async borrar(usuario: UsuarioSesion, id: string): Promise<void> {
    const archivo = await this.prisma.archivo.findUnique({
      where: { id },
      select: {
        id: true,
        propietarioId: true,
        clave: true,
        claveMiniatura: true,
        _count: { select: { fotosNegocio: true, fotosPublicacion: true } },
      },
    });
    if (!archivo || archivo.propietarioId !== usuario.id) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa foto.', 404);
    }
    if (archivo._count.fotosPublicacion > 0) {
      throw new ErrorNegocio('FOTO_EN_USO', 'Esta foto está en una publicación. Quítala al editarla.', 409);
    }
    if (archivo._count.fotosNegocio > 0) {
      throw new ErrorNegocio('FOTO_EN_USO', 'Esta foto ya está en tu registro. Cámbiala al corregir tus datos.', 409);
    }
    await this.prisma.archivo.delete({ where: { id } });
    await this.borrarObjetos(archivo);
  }

  // Fotos de una publicación: del reciclador, de propósito PUBLICACION y no usadas en otra publicación
  async exigirFotosPublicacion(
    cliente: ClienteBd,
    usuarioId: string,
    ids: string[],
    publicacionId: string | null,
  ): Promise<void> {
    if (ids.length === 0) return;
    const validas = await cliente.archivo.count({
      where: {
        id: { in: ids },
        propietarioId: usuarioId,
        proposito: 'PUBLICACION',
        fotosPublicacion: { none: publicacionId ? { publicacionId: { not: publicacionId } } : {} },
      },
    });
    if (validas !== new Set(ids).size || validas !== ids.length) {
      throw new ErrorNegocio('FOTO_NO_VALIDA', 'Alguna foto no es tuya o ya no existe. Vuelve a subirla.', 422, [
        { campo: 'fotos', mensaje: 'Vuelve a subir la foto.' },
      ]);
    }
  }

  // Tras editar una publicación, las fotos que se quitaron se eliminan del almacén
  async borrarSiSueltas(usuarioId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const sueltas = await this.prisma.archivo.findMany({
      where: { id: { in: ids }, propietarioId: usuarioId, proposito: 'PUBLICACION', fotosPublicacion: { none: {} } },
      select: { id: true, clave: true, claveMiniatura: true },
    });
    if (sueltas.length === 0) return;
    await this.prisma.archivo.deleteMany({ where: { id: { in: sueltas.map((archivo) => archivo.id) } } });
    for (const archivo of sueltas) await this.borrarObjetos(archivo);
  }

  private async mismaCiudad(usuarioId: string, ciudadId: number): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { ciudadId: true } });
    return usuario?.ciudadId === ciudadId;
  }

  // Comprueba que las fotos del registro sean del negocio y no estén en otro registro
  async exigirFotosPropias(cliente: ClienteBd, usuarioId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const validas = await cliente.archivo.count({
      where: { id: { in: ids }, propietarioId: usuarioId, proposito: 'NEGOCIO' },
    });
    if (validas !== ids.length) {
      throw new ErrorNegocio('FOTO_NO_VALIDA', 'Alguna foto no es tuya o ya no existe. Vuelve a subirla.', 422, [
        { campo: 'fotos', mensaje: 'Vuelve a subir la foto.' },
      ]);
    }
  }

  // Al enviar el registro, las fotos subidas que no quedaron en él se eliminan
  async limpiarSueltas(usuarioId: string): Promise<void> {
    const sueltas = await this.prisma.archivo.findMany({
      where: { propietarioId: usuarioId, proposito: 'NEGOCIO', fotosNegocio: { none: {} } },
      select: { id: true, clave: true, claveMiniatura: true },
    });
    if (sueltas.length === 0) return;
    await this.prisma.archivo.deleteMany({ where: { id: { in: sueltas.map((archivo) => archivo.id) } } });
    for (const archivo of sueltas) await this.borrarObjetos(archivo);
  }

  // Si el almacén falla al borrar, el objeto queda huérfano pero sin registro que lo exponga
  private async borrarObjetos(archivo: ArchivoGuardado): Promise<void> {
    for (const clave of [archivo.clave, archivo.claveMiniatura]) {
      if (!clave) continue;
      try {
        await this.almacen.borrar(clave);
      } catch (error) {
        this.registro.warn(`No se pudo borrar ${clave}: ${(error as Error).message}`);
      }
    }
  }
}
