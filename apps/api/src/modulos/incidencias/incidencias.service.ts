import { Injectable } from '@nestjs/common';
import type { CodigoMaterial } from '@reciclomap/shared';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { ProgresoService } from '../juego/progreso.service.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { completarOperacion } from '../operaciones/cierre.js';
import { avisosOperacion } from '../operaciones/textos.js';
import { nombreCorto } from '../publicaciones/textos.js';

export type Decision = 'PEDIR_CORRECCION' | 'CERRAR_CON_KILOS_VIGENTES' | 'ANULAR' | 'RESOLVER' | 'DESCARTAR';
// Problemas de la pantalla 29: no tocan la operación; el administrador los resuelve o descarta con motivo
const PROBLEMAS = ['NO_LLEGO', 'PESO', 'PAGO', 'TRATO', 'OTRO'];
const ABIERTAS = ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] as const;

// Resolución mínima del administrador (S4). Usa la conexión de administración, que no puede escribir kilos, montos ni reseñas
@Injectable()
export class IncidenciasService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
    private readonly progreso: ProgresoService,
  ) {}

  async listar(abiertas: boolean) {
    const filas = await this.prisma.reporte.findMany({
      where: { tipo: 'OPERACION', estado: abiertas ? { in: [...ABIERTAS] } : { notIn: [...ABIERTAS] } },
      orderBy: { creadoEn: abiertas ? 'asc' : 'desc' },
      take: 100,
      select: {
        id: true,
        estado: true,
        motivo: true,
        detalle: true,
        decision: true,
        resolucion: true,
        creadoEn: true,
        autor: { select: { rol: true, nombre: true } },
        resueltoEn: true,
        operacion: {
          select: {
            id: true,
            estado: true,
            enDisputa: true,
            kgFinal: true,
            montoFinal: true,
            entregadaEn: true,
            confirmadaEn: true,
            oferta: { select: { precioKg: true } },
            publicacion: { select: { cantidadKg: true, material: { select: { codigo: true, nombre: true } } } },
            reciclador: { select: { nombre: true } },
            comprador: { select: { nombreComercial: true } },
          },
        },
      },
    });
    return {
      datos: filas
        .filter((fila) => fila.operacion)
        .map((fila) => {
          const op = fila.operacion!;
          return {
            id: fila.id,
            estado: fila.estado,
            motivo: fila.motivo,
            detalle: fila.detalle,
            decision: fila.decision,
            resolucion: fila.resolucion,
            abiertaEn: fila.creadoEn.toISOString(),
            resueltaEn: fila.resueltoEn?.toISOString() ?? null,
            operacion: {
              id: op.id,
              estado: op.estado,
              enDisputa: op.enDisputa,
              material: op.publicacion.material as { codigo: CodigoMaterial; nombre: string },
              kgPublicados: Number(op.publicacion.cantidadKg),
              kgConfirmados: op.kgFinal ? Number(op.kgFinal) : null,
              montoFinal: op.montoFinal?.toFixed(2) ?? null,
              precioKg: op.oferta.precioKg.toFixed(2),
              reciclador: nombreCorto(op.reciclador.nombre),
              negocio: op.comprador.nombreComercial,
              entregadaEn: op.entregadaEn?.toISOString() ?? null,
              confirmadaEn: op.confirmadaEn?.toISOString() ?? null,
            },
            // Lo que el administrador puede decidir según el estado: nunca escribir un peso
            decisiones: this.decisiones(op.estado, fila.estado, fila.motivo),
            reportadoPor: fila.autor.rol === 'RECICLADOR' ? 'RECICLADOR' : 'NEGOCIO',
            autor: nombreCorto(fila.autor.nombre),
          };
        }),
    };
  }

  async resolver(adminId: string, reporteId: string, decision: Decision, motivo: string) {
    const cerrada: { cierre: Awaited<ReturnType<typeof completarOperacion>> | null } = { cierre: null };
    const respuesta = await this.prisma.$transaction(async (tx) => {
      const reporte = await tx.reporte.findUnique({
        where: { id: reporteId },
        select: { tipo: true, estado: true, operacionId: true, motivo: true, autorId: true },
      });
      if (!reporte || reporte.tipo !== 'OPERACION' || !reporte.operacionId) {
        throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa incidencia.', 404);
      }
      const operacionId = reporte.operacionId;
      const [operacion] = await tx.$queryRaw<Array<{ estado: string; en_disputa: boolean }>>`
        SELECT estado::text AS estado, en_disputa FROM operacion WHERE id = ${operacionId}::uuid FOR UPDATE`;
      if (!operacion || !(ABIERTAS as readonly string[]).includes(reporte.estado)) {
        throw new ErrorNegocio('INCIDENCIA_CERRADA', 'Esta incidencia ya fue resuelta.', 409);
      }
      if (!this.decisiones(operacion.estado, reporte.estado, reporte.motivo).includes(decision)) {
        throw new ErrorNegocio('DECISION_NO_VALIDA', 'Esa decisión no aplica al estado actual de la operación.', 409);
      }
      const contexto = await tx.operacion.findUniqueOrThrow({
        where: { id: operacionId },
        select: {
          recicladorId: true,
          comprador: { select: { usuarioId: true } },
          publicacionId: true,
          publicacion: { select: { cantidadKg: true, material: { select: { nombre: true } } } },
        },
      });
      const base = {
        operacionId,
        material: contexto.publicacion.material.nombre,
        kg: contexto.publicacion.cantidadKg.toString(),
      };
      const ahora = new Date();
      let resultado: string;

      if (decision === 'RESOLVER' || decision === 'DESCARTAR') {
        await tx.reporte.update({
          where: { id: reporteId },
          data: {
            estado: decision === 'RESOLVER' ? 'RESUELTO' : 'DESCARTADO',
            decision: motivo,
            resueltoPorId: adminId,
            resueltoEn: ahora,
          },
        });
        resultado = decision === 'RESOLVER' ? 'la dimos por resuelta.' : 'la descartamos.';
        await this.notificaciones.crear(
          tx,
          avisosOperacion.resuelta({ ...base, usuarioId: reporte.autorId, resultado: `${resultado} ${motivo}` }),
        );
      } else if (decision === 'PEDIR_CORRECCION') {
        // El negocio vuelve a confirmar los kilos; el administrador no los escribe
        await tx.operacion.update({ where: { id: operacionId }, data: { correccionPedidaEn: ahora } });
        await tx.reporte.update({
          where: { id: reporteId },
          data: {
            estado: 'CORRECCION_PEDIDA',
            decision: motivo,
            resueltoPorId: adminId,
            // El negocio tiene 72 h para corregir; si no lo hace, la administración decide
            plazoHasta: new Date(ahora.getTime() + 72 * 3_600_000),
          },
        });
        await this.notificaciones.crear(
          tx,
          avisosOperacion.correccionPedida({ ...base, usuarioId: contexto.comprador.usuarioId, motivo }),
        );
        resultado = 'Se pidió al negocio corregir los kilos.';
      } else if (decision === 'CERRAR_CON_KILOS_VIGENTES') {
        const cierre = await completarOperacion(tx, operacionId, { porPlazo: false });
        cerrada.cierre = cierre;
        await tx.reporte.update({
          where: { id: reporteId },
          data: {
            estado: 'RESUELTO',
            resolucion: 'CERRADA_CON_KILOS_VIGENTES',
            decision: motivo,
            resueltoPorId: adminId,
            resueltoEn: ahora,
          },
        });
        resultado = `Se cerró con los kilos confirmados (${cierre.kg} kg, +${cierre.puntos} puntos).`;
      } else {
        // Anular: sin puntos; la publicación queda cancelada
        await tx.operacion.update({
          where: { id: operacionId },
          data: {
            estado: 'CANCELADA',
            enDisputa: false,
            motivoCancelacion: `Anulada por la administración: ${motivo}`.slice(0, 200),
            canceladaPorId: adminId,
            canceladaEn: ahora,
          },
        });
        await tx.publicacion.update({
          where: { id: contexto.publicacionId },
          data: {
            estado: 'CANCELADA',
            motivoCancelacion: 'Operación anulada por la administración',
            canceladaPorId: adminId,
          },
        });
        await tx.reporte.update({
          where: { id: reporteId },
          data: {
            estado: 'RESUELTO',
            resolucion: 'ANULADA',
            decision: motivo,
            resueltoPorId: adminId,
            resueltoEn: ahora,
          },
        });
        resultado = 'Se anuló la operación sin puntos.';
      }

      if (decision === 'CERRAR_CON_KILOS_VIGENTES' || decision === 'ANULAR') {
        for (const usuarioId of [contexto.recicladorId, contexto.comprador.usuarioId]) {
          await this.notificaciones.crear(
            tx,
            avisosOperacion.resuelta({ ...base, usuarioId, resultado: `${resultado} ${motivo}` }),
          );
        }
      }
      await auditar(tx, {
        adminId,
        tipo: 'REPORTES',
        accion: `incidencia_${decision.toLowerCase()}`,
        entidad: 'operacion',
        entidadId: operacionId,
        motivo,
        antes: { estado: operacion.estado, enDisputa: operacion.en_disputa, incidencia: reporte.estado },
        despues: { decision, resultado },
      });
      return { decision, resultado };
    });
    // Insignias y desafíos se evalúan con la conexión de la API, que es la que puede escribirlos
    if (cerrada.cierre) await this.progreso.despuesDeCompletar(cerrada.cierre);
    return respuesta;
  }

  private decisiones(estadoOperacion: string, estadoReporte: string, motivo: string): Decision[] {
    if (!(ABIERTAS as readonly string[]).includes(estadoReporte)) return [];
    if (PROBLEMAS.includes(motivo)) return ['RESOLVER', 'DESCARTAR'];
    if (estadoOperacion === 'CONFIRMADA') {
      return estadoReporte === 'CORRECCION_PEDIDA'
        ? ['CERRAR_CON_KILOS_VIGENTES', 'ANULAR']
        : ['PEDIR_CORRECCION', 'CERRAR_CON_KILOS_VIGENTES', 'ANULAR'];
    }
    // En ENTREGADA aún no hay kilos: se pide confirmarlos o se anula
    if (estadoOperacion === 'ENTREGADA')
      return estadoReporte === 'CORRECCION_PEDIDA' ? ['ANULAR'] : ['PEDIR_CORRECCION', 'ANULAR'];
    return [];
  }
}
