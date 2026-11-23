import { Injectable } from '@nestjs/common';
import {
  PARAMETROS_EDITABLES,
  PARAMETROS_FIJOS,
  REGLAS_FIJAS_PRODUCTO,
  TEXTO_GRUPO_PARAMETRO,
  reglaDe,
  type esquemaCambiarParametro,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

// Parámetros editables: cada uno con su rango, su motivo y su historial. Se aplican desde ese momento, nunca hacia atrás
@Injectable()
export class ParametrosAdminService {
  constructor(private readonly prisma: PrismaAdmin) {}

  async listar() {
    const claves = [...PARAMETROS_EDITABLES.map((r) => r.clave), ...PARAMETROS_FIJOS.map((f) => f.clave)];
    const [filas, ultimos, recientes] = await Promise.all([
      this.prisma.parametro.findMany({ where: { clave: { in: claves } } }),
      this.prisma.parametroHistorial.findMany({
        where: { clave: { in: PARAMETROS_EDITABLES.map((r) => r.clave) } },
        orderBy: { creadoEn: 'desc' },
        distinct: ['clave'],
        select: { clave: true, creadoEn: true, motivo: true, admin: { select: { nombre: true } } },
      }),
      this.recientes(8),
    ]);
    const valor = (clave: string) => filas.find((f) => f.clave === clave)?.valor ?? null;
    return {
      grupos: Object.entries(TEXTO_GRUPO_PARAMETRO).map(([clave, titulo]) => ({
        clave,
        titulo,
        parametros: PARAMETROS_EDITABLES.filter((r) => r.grupo === clave).map((r) => {
          const ultimo = ultimos.find((u) => u.clave === r.clave);
          return {
            ...r,
            valor: valor(r.clave) === null ? null : Number(valor(r.clave)),
            ultimoCambio: ultimo
              ? { fecha: ultimo.creadoEn, administrador: ultimo.admin.nombre, motivo: ultimo.motivo }
              : null,
          };
        }),
      })),
      fijos: PARAMETROS_FIJOS.map((f) => ({ ...f, valor: valor(f.clave) })),
      reglasFijas: REGLAS_FIJAS_PRODUCTO,
      recientes,
    };
  }

  async recientes(cuantos: number) {
    const filas = await this.prisma.parametroHistorial.findMany({
      where: { clave: { not: 'ruleta_en_pausa' } },
      orderBy: { creadoEn: 'desc' },
      take: cuantos,
      select: {
        clave: true,
        valorAnterior: true,
        valorNuevo: true,
        motivo: true,
        creadoEn: true,
        admin: { select: { nombre: true } },
      },
    });
    return filas.map((f) => ({
      clave: f.clave,
      etiqueta: reglaDe(f.clave)?.etiqueta ?? f.clave,
      unidad: reglaDe(f.clave)?.unidad ?? '',
      anterior: f.valorAnterior,
      nuevo: f.valorNuevo,
      motivo: f.motivo,
      fecha: f.creadoEn,
      administrador: f.admin.nombre,
    }));
  }

  async historial(clave: string) {
    const regla = reglaDe(clave);
    if (!regla) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese parámetro.', 404);
    const filas = await this.prisma.parametroHistorial.findMany({
      where: { clave },
      orderBy: { creadoEn: 'desc' },
      take: 50,
      select: {
        valorAnterior: true,
        valorNuevo: true,
        motivo: true,
        creadoEn: true,
        admin: { select: { nombre: true } },
      },
    });
    return {
      clave,
      etiqueta: regla.etiqueta,
      unidad: regla.unidad,
      datos: filas.map((f) => ({
        anterior: f.valorAnterior,
        nuevo: f.valorNuevo,
        motivo: f.motivo,
        fecha: f.creadoEn,
        administrador: f.admin.nombre,
      })),
    };
  }

  async cambiar(adminId: string, clave: string, datos: z.infer<typeof esquemaCambiarParametro>) {
    const regla = reglaDe(clave);
    if (!regla) {
      throw new ErrorNegocio('PARAMETRO_NO_EDITABLE', 'Este parámetro no se edita desde la administración.', 403);
    }
    if (!Number.isInteger(datos.valor)) {
      throw new ErrorNegocio('VALOR_NO_VALIDO', 'Escribe un número entero.', 422, [
        { campo: 'valor', mensaje: 'Escribe un número entero.' },
      ]);
    }
    if (datos.valor < regla.minimo || datos.valor > regla.maximo) {
      const mensaje = `Debe estar entre ${regla.minimo} y ${regla.maximo} ${regla.unidad}.`;
      throw new ErrorNegocio('VALOR_FUERA_DE_RANGO', mensaje, 422, [{ campo: 'valor', mensaje }]);
    }
    if (regla.costoPremios && datos.confirmarCosto !== true) {
      throw new ErrorNegocio(
        'CONFIRMACION_REQUERIDA',
        'Este parámetro cambia cuántos premios se reparten. Confirma el cambio para continuar.',
        422,
        [{ campo: 'confirmarCosto', mensaje: 'Confirma que entiendes el efecto sobre los premios.' }],
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.parametro.findUnique({ where: { clave } });
      if (!actual) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese parámetro.', 404);
      const nuevo = String(datos.valor);
      if (actual.valor === nuevo) throw new ErrorNegocio('SIN_CAMBIO', 'El parámetro ya tiene ese valor.', 409);
      // Los dos radios se mueven juntos: el de búsqueda nunca supera el máximo
      const otro =
        clave === 'radio_defecto_km' ? 'radio_maximo_km' : clave === 'radio_maximo_km' ? 'radio_defecto_km' : null;
      if (otro) {
        const par = Number((await tx.parametro.findUnique({ where: { clave: otro } }))?.valor);
        const defecto = clave === 'radio_defecto_km' ? datos.valor : par;
        const maximo = clave === 'radio_maximo_km' ? datos.valor : par;
        if (defecto > maximo) {
          const mensaje = 'El radio por defecto no puede superar el radio máximo.';
          throw new ErrorNegocio('VALOR_FUERA_DE_RANGO', mensaje, 422, [{ campo: 'valor', mensaje }]);
        }
      }
      await tx.parametro.update({ where: { clave }, data: { valor: nuevo, actualizadoEn: new Date() } });
      await tx.parametroHistorial.create({
        data: { clave, valorAnterior: actual.valor, valorNuevo: nuevo, motivo: datos.motivo, adminId },
      });
      await auditar(tx, {
        adminId,
        tipo: 'PARAMETROS',
        accion: 'CAMBIAR',
        entidad: 'parametro',
        entidadId: clave,
        motivo: datos.motivo,
        antes: { valor: actual.valor },
        despues: { valor: nuevo, rige: 'desde este momento' },
      });
      return { clave, anterior: actual.valor, nuevo, etiqueta: regla.etiqueta };
    });
  }
}
