import { Injectable } from '@nestjs/common';
import type { CodigoMaterial } from '@reciclomap/shared';
import type { ModeracionEstado } from '../../generado/prisma/enums.js';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

type Accion = 'MARCAR' | 'PEDIR_CORRECCION' | 'SUSPENDER' | 'RESTITUIR';
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
// Fuera de este margen respecto de la mediana del material en la ciudad, el precio se ve atípico
const DESVIO_ALTO = 0.6;
const DESVIO_BAJO = 0.4;

const TEXTO_ESTADO: Record<ModeracionEstado, string> = {
  SOSPECHOSO: 'marcado como sospechoso',
  CORRECCION_PEDIDA: 'con corrección pedida',
  SUSPENDIDO: 'con visibilidad suspendida',
};

// Qué puede hacer el administrador según la moderación vigente; nunca editar el valor (RN-04, RN-05)
function accionesPara(estado: ModeracionEstado | null): Accion[] {
  if (!estado) return ['MARCAR', 'PEDIR_CORRECCION', 'SUSPENDER'];
  if (estado === 'SOSPECHOSO') return ['PEDIR_CORRECCION', 'SUSPENDER', 'RESTITUIR'];
  if (estado === 'CORRECCION_PEDIDA') return ['SUSPENDER', 'RESTITUIR'];
  return ['RESTITUIR'];
}

const mediana = (valores: number[]) => {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2;
};

@Injectable()
export class ModeracionService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Pantalla 61: precios ordenados por riesgo, con sus alertas y la moderación vigente
  async listar() {
    const ahora = Date.now();
    const [filas, diasAlDia, reportes] = await Promise.all([
      this.prisma.precioMaterial.findMany({
        where: { activo: true, comprador: { estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } } },
        select: {
          id: true,
          precioMin: true,
          precioMax: true,
          actualizadoEn: true,
          material: { select: { codigo: true, nombre: true } },
          comprador: {
            select: { id: true, nombreComercial: true, tipo: true, usuario: { select: { ciudadId: true } } },
          },
          moderaciones: {
            where: { cerradaEn: null },
            take: 1,
            select: { estado: true, motivo: true, plazoHasta: true, creadaEn: true },
          },
        },
      }),
      this.diasPrecioAlDia(),
      this.prisma.reporte.groupBy({
        by: ['compradorId', 'materialId'],
        where: { tipo: 'NEGOCIO', motivo: 'PRECIO', estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] } },
        _count: { _all: true },
      }),
    ]);
    const materiales = await this.prisma.material.findMany({ select: { id: true, codigo: true } });
    const idMaterial = new Map(materiales.map((m) => [m.codigo, m.id]));
    const medios = new Map<string, number[]>();
    for (const fila of filas) {
      const clave = `${fila.comprador.usuario.ciudadId}:${fila.material.codigo}`;
      medios.set(clave, [...(medios.get(clave) ?? []), (Number(fila.precioMin) + Number(fila.precioMax)) / 2]);
    }
    const lista = filas.map((fila) => {
      const medio = (Number(fila.precioMin) + Number(fila.precioMax)) / 2;
      const grupo = medios.get(`${fila.comprador.usuario.ciudadId}:${fila.material.codigo}`) ?? [];
      const referencia = grupo.length >= 3 ? mediana(grupo) : null;
      const alertas: string[] = [];
      let riesgo = 0;
      if (referencia) {
        const desvio = (medio - referencia) / referencia;
        if (desvio >= DESVIO_ALTO) {
          alertas.push(`Mucho más alto que el resto (+${Math.round(desvio * 100)} %)`);
          riesgo += 3;
        } else if (desvio <= -DESVIO_BAJO) {
          alertas.push(`Mucho más bajo que el resto (${Math.round(desvio * 100)} %)`);
          riesgo += 2;
        }
      }
      const dias = Math.floor((ahora - fila.actualizadoEn.getTime()) / DIA_MS);
      if (dias > diasAlDia) {
        alertas.push(`Sin actualizar hace ${dias} días`);
        riesgo += 1;
      }
      const reportados =
        reportes.find(
          (r) => r.compradorId === fila.comprador.id && r.materialId === idMaterial.get(fila.material.codigo),
        )?._count._all ?? 0;
      if (reportados > 0) {
        alertas.push(`${reportados} ${reportados === 1 ? 'reporte' : 'reportes'} de precio`);
        riesgo += 2 * reportados;
      }
      const moderacion = fila.moderaciones[0] ?? null;
      return {
        id: fila.id,
        negocio: { id: fila.comprador.id, nombre: fila.comprador.nombreComercial, tipo: fila.comprador.tipo },
        material: fila.material as { codigo: CodigoMaterial; nombre: string },
        min: fila.precioMin.toFixed(2),
        max: fila.precioMax.toFixed(2),
        actualizadoEn: fila.actualizadoEn.toISOString(),
        alertas,
        riesgo,
        moderacion: moderacion
          ? {
              estado: moderacion.estado,
              motivo: moderacion.motivo,
              plazoHasta: moderacion.plazoHasta?.toISOString() ?? null,
              plazoVencido: !!moderacion.plazoHasta && moderacion.plazoHasta.getTime() < ahora,
              desde: moderacion.creadaEn.toISOString(),
            }
          : null,
        acciones: accionesPara(moderacion?.estado ?? null),
      };
    });
    lista.sort(
      (a, b) =>
        Number(!!b.moderacion?.plazoVencido) - Number(!!a.moderacion?.plazoVencido) ||
        Number(!!b.moderacion) - Number(!!a.moderacion) ||
        b.riesgo - a.riesgo ||
        a.negocio.nombre.localeCompare(b.negocio.nombre),
    );
    const registro = await this.prisma.auditoria.findMany({
      where: { tipo: 'PRECIOS' },
      orderBy: { creadaEn: 'desc' },
      take: 20,
      select: { accion: true, motivo: true, despues: true, creadaEn: true },
    });
    return {
      datos: lista,
      registro: registro.map((r) => ({
        accion: r.accion,
        motivo: r.motivo,
        detalle: r.despues,
        creadaEn: r.creadaEn.toISOString(),
      })),
    };
  }

  marcar(adminId: string, id: string, motivo: string) {
    return this.aplicar(adminId, id, 'MARCAR', motivo);
  }

  pedirCorreccion(adminId: string, id: string, motivo: string, plazoHoras: number) {
    return this.aplicar(adminId, id, 'PEDIR_CORRECCION', motivo, plazoHoras);
  }

  suspender(adminId: string, id: string, motivo: string) {
    return this.aplicar(adminId, id, 'SUSPENDER', motivo);
  }

  restituir(adminId: string, id: string, motivo: string) {
    return this.aplicar(adminId, id, 'RESTITUIR', motivo);
  }

  // Cada acción cierra la moderación vigente y abre la nueva; el valor del precio no se toca
  private async aplicar(adminId: string, id: string, accion: Accion, motivo: string, plazoHoras?: number) {
    return this.prisma.$transaction(async (tx) => {
      // La conexión de administración no puede bloquear filas de precios (no tiene UPDATE): se serializa por id
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const bloqueo = await tx.precioMaterial.count({ where: { id } });
      const precio = bloqueo
        ? await tx.precioMaterial.findUnique({
            where: { id },
            select: {
              precioMin: true,
              precioMax: true,
              material: { select: { nombre: true } },
              comprador: { select: { nombreComercial: true, usuarioId: true } },
              moderaciones: { where: { cerradaEn: null }, take: 1, select: { id: true, estado: true } },
            },
          })
        : null;
      if (!precio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese precio.', 404);
      const vigente = precio.moderaciones[0] ?? null;
      if (!accionesPara(vigente?.estado ?? null).includes(accion)) {
        throw new ErrorNegocio('ACCION_NO_VALIDA', 'Esa acción no aplica al estado actual de este precio.', 409);
      }
      const ahora = new Date();
      if (vigente) {
        await tx.moderacionPrecio.update({
          where: { id: vigente.id },
          data: {
            cerradaEn: ahora,
            motivoCierre: accion === 'RESTITUIR' ? motivo : `Reemplazada: ${motivo}`.slice(0, 300),
          },
        });
      }
      const nuevo: ModeracionEstado | null =
        accion === 'MARCAR'
          ? 'SOSPECHOSO'
          : accion === 'PEDIR_CORRECCION'
            ? 'CORRECCION_PEDIDA'
            : accion === 'SUSPENDER'
              ? 'SUSPENDIDO'
              : null;
      const plazoHasta =
        accion === 'PEDIR_CORRECCION' && plazoHoras ? new Date(ahora.getTime() + plazoHoras * HORA_MS) : null;
      if (nuevo) {
        await tx.moderacionPrecio.create({
          data: { precioMaterialId: id, estado: nuevo, motivo, plazoHasta, adminId },
        });
      }
      const material = precio.material.nombre;
      const aviso =
        accion === 'PEDIR_CORRECCION'
          ? {
              titulo: `Corrige tu precio de ${material}`,
              mensaje: `Te pedimos revisarlo antes del plazo. Motivo: ${motivo}`,
            }
          : accion === 'SUSPENDER'
            ? {
                titulo: `Suspendimos tu precio de ${material}`,
                mensaje: `No se muestra a los recicladores. Motivo: ${motivo}`,
              }
            : accion === 'RESTITUIR'
              ? { titulo: `Tu precio de ${material} vuelve a mostrarse`, mensaje: `Motivo: ${motivo}` }
              : null;
      if (aviso) {
        await this.notificaciones.crear(tx, {
          usuarioId: precio.comprador.usuarioId,
          tipo: 'PRECIO',
          titulo: aviso.titulo,
          mensaje: aviso.mensaje.slice(0, 200),
          enlace: '/negocio/precios',
          obligatoria: true,
        });
      }
      const resultado = {
        negocio: precio.comprador.nombreComercial,
        material,
        rango: `${precio.precioMin.toFixed(2)}–${precio.precioMax.toFixed(2)}`,
        estado: nuevo ? TEXTO_ESTADO[nuevo] : 'visible sin moderación',
        plazoHasta: plazoHasta?.toISOString() ?? null,
      };
      await auditar(tx, {
        adminId,
        tipo: 'PRECIOS',
        accion: `precio_${accion.toLowerCase()}`,
        entidad: 'precio_material',
        entidadId: id,
        motivo,
        antes: { moderacion: vigente?.estado ?? null },
        despues: resultado,
      });
      return resultado;
    });
  }

  private async diasPrecioAlDia(): Promise<number> {
    const fila = await this.prisma.parametro.findUnique({
      where: { clave: 'dias_precio_al_dia' },
      select: { valor: true },
    });
    const dias = Number(fila?.valor);
    return Number.isFinite(dias) && dias > 0 ? dias : 7;
  }
}
