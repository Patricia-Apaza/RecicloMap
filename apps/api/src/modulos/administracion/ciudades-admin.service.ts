import { Injectable } from '@nestjs/common';
import type { esquemaNuevaCiudad, esquemaRequisitosCiudad, esquemaZona } from '@reciclomap/shared';
import type { z } from 'zod';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

// Ciudades y zonas (pantalla 63): una ciudad se abre solo con sus requisitos y la lista de espera se avisa una sola vez
@Injectable()
export class CiudadesAdminService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async listar() {
    const ciudades = await this.prisma.ciudad.findMany({
      orderBy: [{ estado: 'asc' }, { nombre: 'asc' }],
      include: { _count: { select: { zonas: true, usuarios: true } } },
    });
    const [moviles, espera, avisadas, zonas] = await Promise.all([
      this.prisma.$queryRaw<Array<{ ciudad: number; tipo: string; n: number }>>`
        SELECT u.ciudad_id AS ciudad, c.tipo::text AS tipo, count(*)::int AS n
          FROM comprador c JOIN usuario u ON u.id = c.usuario_id WHERE c.estado_verificacion = 'APROBADO' GROUP BY 1, 2`,
      this.prisma.listaEsperaCiudad.groupBy({ by: ['ciudadId'], _count: { _all: true } }),
      this.prisma.listaEsperaCiudad.groupBy({
        by: ['ciudadId'],
        where: { avisadaEn: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ id: number; ciudad_id: number; nombre: string; lat: number; lng: number }>>`
        SELECT id, ciudad_id, nombre, ST_Y(centro::geometry) AS lat, ST_X(centro::geometry) AS lng FROM zona ORDER BY nombre`,
    ]);
    const minimoCentros = 5;
    return {
      datos: ciudades.map((c) => {
        const nCentros = moviles.find((m) => m.ciudad === c.id && m.tipo === 'CENTRO')?.n ?? 0;
        const nMoviles = moviles.find((m) => m.ciudad === c.id && m.tipo === 'MOVIL')?.n ?? 0;
        const requisitos = {
          zonas: c._count.zonas > 0,
          verificadoresAsignados: c.verificadoresAsignados,
          preciosBaseCargados: c.preciosBaseCargados,
        };
        return {
          id: c.id,
          nombre: c.nombre,
          region: c.region,
          estado: c.estado,
          usuarios: c._count.usuarios,
          centrosVerificados: nCentros,
          movilesVerificados: nMoviles,
          listaEspera: espera.find((e) => e.ciudadId === c.id)?._count._all ?? 0,
          avisadas: avisadas.find((e) => e.ciudadId === c.id)?._count._all ?? 0,
          requisitos,
          // Informativo: una ciudad cerrada no puede tener negocios verificados todavía
          informativo: { centrosVerificados: nCentros, centrosSugeridos: minimoCentros },
          puedeActivar: c.estado === 'PROXIMAMENTE' && Object.values(requisitos).every(Boolean),
          zonas: zonas
            .filter((z) => z.ciudad_id === c.id)
            .map((z) => ({ id: z.id, nombre: z.nombre, lat: z.lat, lng: z.lng })),
        };
      }),
    };
  }

  async crear(adminId: string, datos: z.infer<typeof esquemaNuevaCiudad>) {
    const existe = await this.prisma.ciudad.findFirst({
      where: { nombre: { equals: datos.nombre, mode: 'insensitive' } },
    });
    if (existe) throw new ErrorNegocio('CIUDAD_REPETIDA', 'Ya existe una ciudad con ese nombre.', 409);
    return this.prisma.$transaction(async (tx) => {
      const ciudad = await tx.ciudad.create({
        data: { nombre: datos.nombre, region: datos.region, estado: 'PROXIMAMENTE' },
      });
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'CREAR',
        entidad: 'ciudad',
        entidadId: String(ciudad.id),
        motivo: datos.motivo,
        despues: { nombre: ciudad.nombre, estado: 'PROXIMAMENTE' },
      });
      return { id: ciudad.id, nombre: ciudad.nombre, estado: ciudad.estado };
    });
  }

  private async ciudad(tx: Pick<PrismaAdmin, 'ciudad'>, id: number) {
    const ciudad = await tx.ciudad.findUnique({ where: { id } });
    if (!ciudad) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa ciudad.', 404);
    return ciudad;
  }

  async requisitos(adminId: string, id: number, datos: z.infer<typeof esquemaRequisitosCiudad>) {
    return this.prisma.$transaction(async (tx) => {
      const ciudad = await this.ciudad(tx, id);
      const cambio = {
        ...(datos.verificadoresAsignados !== undefined ? { verificadoresAsignados: datos.verificadoresAsignados } : {}),
        ...(datos.preciosBaseCargados !== undefined ? { preciosBaseCargados: datos.preciosBaseCargados } : {}),
      };
      if (Object.keys(cambio).length === 0) throw new ErrorNegocio('SIN_CAMBIO', 'No hay nada que cambiar.', 409);
      await tx.ciudad.update({ where: { id }, data: cambio });
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'REQUISITOS',
        entidad: 'ciudad',
        entidadId: String(id),
        motivo: datos.motivo,
        antes: {
          verificadoresAsignados: ciudad.verificadoresAsignados,
          preciosBaseCargados: ciudad.preciosBaseCargados,
        },
        despues: { ...cambio, ciudad: ciudad.nombre },
      });
      return { id, ...cambio };
    });
  }

  async crearZona(adminId: string, ciudadId: number, datos: z.infer<typeof esquemaZona>) {
    return this.prisma.$transaction(async (tx) => {
      const ciudad = await this.ciudad(tx, ciudadId);
      const repetida = await tx.zona.findFirst({
        where: { ciudadId, nombre: { equals: datos.nombre, mode: 'insensitive' } },
      });
      if (repetida) throw new ErrorNegocio('ZONA_REPETIDA', 'Esa ciudad ya tiene una zona con ese nombre.', 409);
      const [fila] = await tx.$queryRaw<Array<{ id: number }>>`
        INSERT INTO zona (ciudad_id, nombre, centro)
        VALUES (${ciudadId}, ${datos.nombre}, ST_SetSRID(ST_MakePoint(${datos.lng}::float8, ${datos.lat}::float8), 4326)::geography)
        RETURNING id`;
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'CREAR_ZONA',
        entidad: 'zona',
        entidadId: String(fila!.id),
        motivo: datos.motivo,
        despues: { ciudad: ciudad.nombre, zona: datos.nombre },
      });
      return { id: fila!.id, nombre: datos.nombre };
    });
  }

  async editarZona(adminId: string, zonaId: number, datos: z.infer<typeof esquemaZona>) {
    return this.prisma.$transaction(async (tx) => {
      const zona = await tx.zona.findUnique({
        where: { id: zonaId },
        include: { ciudad: { select: { nombre: true } } },
      });
      if (!zona) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa zona.', 404);
      const repetida = await tx.zona.findFirst({
        where: { ciudadId: zona.ciudadId, id: { not: zonaId }, nombre: { equals: datos.nombre, mode: 'insensitive' } },
      });
      if (repetida) throw new ErrorNegocio('ZONA_REPETIDA', 'Esa ciudad ya tiene una zona con ese nombre.', 409);
      await tx.$executeRaw`
        UPDATE zona SET nombre = ${datos.nombre}, centro = ST_SetSRID(ST_MakePoint(${datos.lng}::float8, ${datos.lat}::float8), 4326)::geography
         WHERE id = ${zonaId}`;
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'EDITAR_ZONA',
        entidad: 'zona',
        entidadId: String(zonaId),
        motivo: datos.motivo,
        antes: { zona: zona.nombre },
        despues: { ciudad: zona.ciudad.nombre, zona: datos.nombre },
      });
      return { id: zonaId, nombre: datos.nombre };
    });
  }

  async eliminarZona(adminId: string, zonaId: number, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      const zona = await tx.zona.findUnique({
        where: { id: zonaId },
        include: {
          ciudad: { select: { nombre: true } },
          _count: { select: { compradores: true, recicladores: true, paradas: true } },
        },
      });
      if (!zona) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa zona.', 404);
      const enUso = zona._count.compradores + zona._count.recicladores + zona._count.paradas;
      if (enUso > 0) throw new ErrorNegocio('ZONA_EN_USO', 'Esa zona la usan cuentas o rutas: no se elimina.', 409);
      await tx.zona.delete({ where: { id: zonaId } });
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'ELIMINAR_ZONA',
        entidad: 'zona',
        entidadId: String(zonaId),
        motivo,
        antes: { ciudad: zona.ciudad.nombre, zona: zona.nombre },
      });
      return { id: zonaId };
    });
  }

  async activar(adminId: string, id: number, motivo: string) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const ciudad = await this.ciudad(tx, id);
      if (ciudad.estado === 'ACTIVA') throw new ErrorNegocio('CIUDAD_YA_ACTIVA', 'Esa ciudad ya está activa.', 409);
      const zonas = await tx.zona.count({ where: { ciudadId: id } });
      const faltan = [
        ...(zonas === 0 ? ['Al menos una zona'] : []),
        ...(!ciudad.verificadoresAsignados ? ['Verificadores asignados'] : []),
        ...(!ciudad.preciosBaseCargados ? ['Precios base cargados'] : []),
      ];
      if (faltan.length > 0) {
        throw new ErrorNegocio(
          'REQUISITOS_INCOMPLETOS',
          `Falta: ${faltan.join(', ')}.`,
          409,
          faltan.map((f) => ({ campo: 'requisitos', mensaje: f })),
        );
      }
      await tx.ciudad.update({ where: { id }, data: { estado: 'ACTIVA' } });
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'ACTIVAR',
        entidad: 'ciudad',
        entidadId: String(id),
        motivo,
        antes: { estado: 'PROXIMAMENTE' },
        despues: { estado: 'ACTIVA', ciudad: ciudad.nombre },
      });
      return ciudad.nombre;
    });
    return { id, estado: 'ACTIVA' as const, avisados: await this.avisarListaDeEspera(id, resultado) };
  }

  // Cada persona recibe el aviso una sola vez: se marca antes de avisar
  async avisarListaDeEspera(ciudadId: number, nombre: string): Promise<number> {
    const pendientes = await this.prisma.listaEsperaCiudad.findMany({
      where: { ciudadId, avisadaEn: null, usuarioId: { not: null } },
      select: { id: true, usuarioId: true },
    });
    let avisados = 0;
    for (const fila of pendientes) {
      const marcada = await this.prisma.listaEsperaCiudad.updateMany({
        where: { id: fila.id, avisadaEn: null },
        data: { avisadaEn: new Date() },
      });
      if (marcada.count === 0 || !fila.usuarioId) continue;
      await this.notificaciones.crear(this.prisma, {
        usuarioId: fila.usuarioId,
        tipo: 'CUENTA',
        titulo: `Ya abrimos ${nombre}`,
        mensaje: `RecicloMap ya está disponible en ${nombre}. Gracias por esperar.`,
        obligatoria: true,
      });
      avisados += 1;
    }
    return avisados;
  }

  async desactivar(adminId: string, id: number, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      const ciudad = await this.ciudad(tx, id);
      if (ciudad.estado !== 'ACTIVA') throw new ErrorNegocio('CIUDAD_NO_ACTIVA', 'Esa ciudad no está activa.', 409);
      const [usuarios, publicaciones, operaciones] = await Promise.all([
        tx.usuario.count({ where: { ciudadId: id, estado: { not: 'ELIMINADO' } } }),
        tx.publicacion.count({
          where: { ciudadId: id, estado: { in: ['DISPONIBLE', 'CON_OFERTAS', 'EN_NEGOCIACION'] } },
        }),
        tx.operacion.count({
          where: {
            publicacion: { ciudadId: id },
            estado: { in: ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'] },
          },
        }),
      ]);
      if (usuarios + publicaciones + operaciones > 0) {
        throw new ErrorNegocio(
          'CIUDAD_EN_USO',
          'No se puede cerrar una ciudad con cuentas, publicaciones u operaciones abiertas.',
          409,
        );
      }
      await tx.ciudad.update({ where: { id }, data: { estado: 'PROXIMAMENTE' } });
      await auditar(tx, {
        adminId,
        tipo: 'CIUDADES',
        accion: 'DESACTIVAR',
        entidad: 'ciudad',
        entidadId: String(id),
        motivo,
        antes: { estado: 'ACTIVA' },
        despues: { estado: 'PROXIMAMENTE', ciudad: ciudad.nombre },
      });
      return { id, estado: 'PROXIMAMENTE' as const };
    });
  }
}
