import { Injectable } from '@nestjs/common';
import { type CodigoMaterial, TEXTO_MOTIVO_REPORTE } from '@reciclomap/shared';
import type { ReporteEstado } from '../../generado/prisma/enums.js';
import { auditar } from '../../nucleo/auditoria/auditoria.js';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { nombreCorto } from '../publicaciones/textos.js';

export type TipoReporteAdmin = 'NEGOCIO' | 'RESENA';
export type EstadoReporteAdmin = 'pendientes' | 'en-revision' | 'cerrados';
type AccionReporte = 'PEDIR_CORRECCION' | 'RESOLVER' | 'DESCARTAR' | 'OCULTAR_RESENA';

const ESTADOS: Record<EstadoReporteAdmin, ReporteEstado[]> = {
  pendientes: ['PENDIENTE'],
  'en-revision': ['EN_REVISION', 'CORRECCION_PEDIDA'],
  cerrados: ['RESUELTO', 'DESCARTADO'],
};
const ABIERTOS: ReporteEstado[] = ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'];
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

type Umbrales = { operacionesPar: number; desvioPct: number; kgOperacion: number };

// Pantalla 60: el administrador decide con motivo y auditoría; nunca edita precios, pesos ni el texto de una reseña
@Injectable()
export class AdminReportesService {
  constructor(
    private readonly prisma: PrismaAdmin,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async listar(tipo: TipoReporteAdmin, estado: EstadoReporteAdmin) {
    const ahora = Date.now();
    const [filas, grupos] = await Promise.all([
      this.prisma.reporte.findMany({
        where: { tipo, estado: { in: ESTADOS[estado] } },
        orderBy: { creadoEn: estado === 'cerrados' ? 'desc' : 'asc' },
        take: 100,
        select: {
          id: true,
          tipo: true,
          motivo: true,
          estado: true,
          detalle: true,
          precioVisto: true,
          decision: true,
          plazoHasta: true,
          creadoEn: true,
          resueltoEn: true,
          autor: { select: { nombre: true, rol: true } },
          comprador: { select: { id: true, nombreComercial: true, tipo: true } },
          material: { select: { codigo: true, nombre: true } },
          calificacion: {
            select: {
              id: true,
              estrellas: true,
              comentario: true,
              creadaEn: true,
              autor: { select: { nombre: true, comprador: { select: { nombreComercial: true } } } },
              destino: { select: { nombre: true, comprador: { select: { nombreComercial: true } } } },
              etiquetas: { select: { etiqueta: { select: { nombre: true } } } },
              oculta: { select: { motivo: true, creadaEn: true } },
              _count: { select: { reportes: true } },
            },
          },
        },
      }),
      this.prisma.reporte.groupBy({ by: ['tipo', 'estado'], _count: { _all: true } }),
    ]);
    const cuenta = (t: string, estados: ReporteEstado[]) =>
      grupos.filter((g) => g.tipo === t && estados.includes(g.estado)).reduce((suma, g) => suma + g._count._all, 0);
    const conteos = {
      NEGOCIO: {
        pendientes: cuenta('NEGOCIO', ESTADOS.pendientes),
        'en-revision': cuenta('NEGOCIO', ESTADOS['en-revision']),
        cerrados: cuenta('NEGOCIO', ESTADOS.cerrados),
      },
      RESENA: {
        pendientes: cuenta('RESENA', ESTADOS.pendientes),
        'en-revision': cuenta('RESENA', ESTADOS['en-revision']),
        cerrados: cuenta('RESENA', ESTADOS.cerrados),
      },
      OPERACION: { abiertas: cuenta('OPERACION', ABIERTOS), cerrados: cuenta('OPERACION', ESTADOS.cerrados) },
    };
    const plazosVencidos = await this.prisma.reporte.count({
      where: { estado: 'CORRECCION_PEDIDA', plazoHasta: { lt: new Date(ahora) } },
    });
    return {
      conteos,
      plazosVencidos,
      datos: filas.map((fila) => {
        const resena = fila.calificacion;
        return {
          id: fila.id,
          tipo: fila.tipo,
          motivo: fila.motivo,
          estado: fila.estado,
          detalle: fila.detalle,
          precioVisto: fila.precioVisto?.toFixed(2) ?? null,
          decision: fila.decision,
          plazoHasta: fila.plazoHasta?.toISOString() ?? null,
          plazoVencido: fila.estado === 'CORRECCION_PEDIDA' && !!fila.plazoHasta && fila.plazoHasta.getTime() < ahora,
          creadoEn: fila.creadoEn.toISOString(),
          resueltoEn: fila.resueltoEn?.toISOString() ?? null,
          // El administrador sí ve quién reportó; el negocio nunca
          autor: { nombre: nombreCorto(fila.autor.nombre), rol: fila.autor.rol },
          negocio: fila.comprador
            ? { id: fila.comprador.id, nombre: fila.comprador.nombreComercial, tipo: fila.comprador.tipo }
            : null,
          material: fila.material as { codigo: CodigoMaterial; nombre: string } | null,
          resena: resena
            ? {
                id: resena.id,
                estrellas: resena.estrellas,
                comentario: resena.comentario,
                etiquetas: resena.etiquetas.map((e) => e.etiqueta.nombre),
                creadaEn: resena.creadaEn.toISOString(),
                autor: resena.autor.comprador?.nombreComercial ?? nombreCorto(resena.autor.nombre),
                destino: resena.destino.comprador?.nombreComercial ?? nombreCorto(resena.destino.nombre),
                reportes: resena._count.reportes,
                oculta: resena.oculta
                  ? { motivo: resena.oculta.motivo, creadaEn: resena.oculta.creadaEn.toISOString() }
                  : null,
              }
            : null,
          acciones: this.acciones(fila.tipo as TipoReporteAdmin, fila.estado, !!resena?.oculta),
        };
      }),
    };
  }

  async pedirCorreccion(adminId: string, id: string, motivo: string, plazoHoras: number) {
    return this.decidir(adminId, id, 'PEDIR_CORRECCION', motivo, async (tx, reporte) => {
      const plazoHasta = new Date(Date.now() + plazoHoras * HORA_MS);
      await tx.reporte.update({
        where: { id },
        data: {
          estado: 'CORRECCION_PEDIDA',
          decision: motivo,
          plazoHasta,
          plazoAvisadoEn: null,
          resueltoPorId: adminId,
        },
      });
      if (reporte.negocioUsuarioId) {
        await this.notificaciones.crear(tx, {
          usuarioId: reporte.negocioUsuarioId,
          tipo: 'AVISO',
          titulo: 'Te pedimos corregir un dato',
          mensaje: `${TEXTO_MOTIVO_REPORTE[reporte.motivo]}: ${motivo}`.slice(0, 200),
          enlace: '/negocio/reportes',
          obligatoria: true,
        });
      }
      return { estado: 'CORRECCION_PEDIDA', plazoHasta: plazoHasta.toISOString() };
    });
  }

  async resolver(adminId: string, id: string, motivo: string) {
    return this.decidir(adminId, id, 'RESOLVER', motivo, async (tx, reporte) => {
      await this.cerrar(tx, id, 'RESUELTO', adminId, motivo);
      await this.avisarAutor(tx, reporte.autorId, 'Revisamos tu reporte y lo dimos por resuelto. Gracias por avisar.');
      if (reporte.negocioUsuarioId && reporte.estado !== 'PENDIENTE') {
        await this.notificaciones.crear(tx, {
          usuarioId: reporte.negocioUsuarioId,
          tipo: 'AVISO',
          titulo: 'Reporte resuelto',
          mensaje: `Cerramos el reporte "${TEXTO_MOTIVO_REPORTE[reporte.motivo]}". ${motivo}`.slice(0, 200),
          enlace: '/negocio/reportes',
          obligatoria: true,
        });
      }
      return { estado: 'RESUELTO' };
    });
  }

  async descartar(adminId: string, id: string, motivo: string) {
    return this.decidir(adminId, id, 'DESCARTAR', motivo, async (tx, reporte) => {
      await this.cerrar(tx, id, 'DESCARTADO', adminId, motivo);
      await this.avisarAutor(
        tx,
        reporte.autorId,
        'Revisamos tu reporte y no encontramos un problema. Gracias por avisar.',
      );
      return { estado: 'DESCARTADO' };
    });
  }

  // La reseña no se borra ni se edita: se marca como oculta; el autor recibe un aviso
  async ocultarResena(adminId: string, id: string, motivo: string) {
    return this.decidir(adminId, id, 'OCULTAR_RESENA', motivo, async (tx, reporte) => {
      if (!reporte.calificacionId) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa reseña.', 404);
      const resena = await tx.calificacion.findUniqueOrThrow({
        where: { id: reporte.calificacionId },
        select: { autorId: true, oculta: { select: { calificacionId: true } } },
      });
      if (resena.oculta) throw new ErrorNegocio('YA_OCULTA', 'Esta reseña ya está oculta.', 409);
      await tx.resenaOculta.create({ data: { calificacionId: reporte.calificacionId, adminId, motivo } });
      // Todos los reportes abiertos sobre esa reseña quedan resueltos con la misma decisión
      await tx.reporte.updateMany({
        where: { tipo: 'RESENA', calificacionId: reporte.calificacionId, estado: { in: ABIERTOS } },
        data: { estado: 'RESUELTO', decision: motivo, resueltoPorId: adminId, resueltoEn: new Date() },
      });
      await this.notificaciones.crear(tx, {
        usuarioId: resena.autorId,
        tipo: 'AVISO',
        titulo: 'Ocultamos una reseña tuya',
        mensaje: `No cumplía las reglas de la comunidad. Motivo: ${motivo}`.slice(0, 200),
        obligatoria: true,
      });
      await this.avisarAutor(tx, reporte.autorId, 'Revisamos la reseña que reportaste y la ocultamos.');
      return { estado: 'RESUELTO', resenaOculta: true };
    });
  }

  // Posible colusión (Fase 1): pares repetidos y pesos atípicos. Solo alertan; nada se bloquea
  // Colusión: la señal es "recibido mayor que publicado"; "recibido menor" es calidad y va a incidencias.
  // Las alertas muestran contexto, solo alertan (nunca bloquean) y se pueden descartar con motivo
  async alertas(dias: number) {
    const u = await this.umbrales();
    const desde = new Date(Date.now() - dias * DIA_MS);
    const pares = await this.prisma.$queryRaw<
      Array<{ clave: string; reciclador: string; negocio: string; maximo: number; total: number; ultima: Date }>
    >`
      WITH hechos AS (
        SELECT o.reciclador_id, o.comprador_id, o.completada_en AS cuando FROM operacion o
         WHERE o.estado = 'COMPLETADA' AND o.completada_en >= ${desde}
        UNION ALL
        SELECT r.reciclador_id, r.comprador_id, r.resuelto_en FROM registro_reciclaje r
         WHERE r.estado = 'CONFIRMADO' AND r.resuelto_en >= ${desde}
      ), ops AS (
        SELECT h.reciclador_id, h.comprador_id, h.cuando AS completada_en,
               (h.reciclador_id::text || ':' || h.comprador_id::text) AS clave
          FROM hechos h
         WHERE h.cuando > COALESCE(
                 (SELECT max(d.creada_en) FROM alerta_descartada d
                   WHERE d.tipo = 'PAR' AND d.clave = h.reciclador_id::text || ':' || h.comprador_id::text),
                 '-infinity'::timestamptz)
      ), ventanas AS (
        SELECT clave, reciclador_id, comprador_id, completada_en,
               count(*) OVER (PARTITION BY clave ORDER BY completada_en
                              RANGE BETWEEN interval '7 days' PRECEDING AND CURRENT ROW) AS en_7_dias
          FROM ops
      )
      SELECT v.clave, u.nombre AS reciclador, c.nombre_comercial AS negocio,
             max(v.en_7_dias)::int AS maximo, count(*)::int AS total, max(v.completada_en) AS ultima
        FROM ventanas v
        JOIN usuario u ON u.id = v.reciclador_id
        JOIN comprador c ON c.id = v.comprador_id
       GROUP BY v.clave, u.nombre, c.nombre_comercial
      HAVING max(v.en_7_dias) >= ${u.operacionesPar}
       ORDER BY maximo DESC, ultima DESC`;
    const contexto = pares.length
      ? await this.prisma.$queryRaw<
          Array<{ clave: string; fecha: Date; kg: number; material: string; origen: string }>
        >`
          SELECT clave, fecha, kg, material, origen FROM (
            SELECT (o.reciclador_id::text || ':' || o.comprador_id::text) AS clave, o.completada_en AS fecha,
                   o.kg_final::float8 AS kg, m.nombre AS material, 'OPERACION' AS origen
              FROM operacion o JOIN publicacion p ON p.id = o.publicacion_id JOIN material m ON m.id = p.material_id
             WHERE o.estado = 'COMPLETADA' AND o.completada_en >= ${desde}
            UNION ALL
            SELECT (r.reciclador_id::text || ':' || r.comprador_id::text), r.resuelto_en,
                   r.kg_confirmado::float8, m.nombre, 'DIRECTA'
              FROM registro_reciclaje r JOIN material m ON m.id = r.material_id
             WHERE r.estado = 'CONFIRMADO' AND r.resuelto_en >= ${desde}
          ) x
           WHERE clave = ANY(${pares.map((p) => p.clave)}::text[])
           ORDER BY fecha DESC`
      : [];
    const pesos = await this.prisma.$queryRaw<
      Array<{
        id: string;
        reciclador: string;
        negocio: string;
        material: string;
        publicados: number;
        recibidos: number;
        publicada_en: Date;
        completada_en: Date;
        origen: string;
      }>
    >`
      SELECT * FROM (
        SELECT o.id, u.nombre AS reciclador, c.nombre_comercial AS negocio, m.nombre AS material,
               p.cantidad_kg::float8 AS publicados, o.kg_final::float8 AS recibidos,
               p.creada_en AS publicada_en, o.completada_en, 'OPERACION' AS origen
          FROM operacion o
          JOIN publicacion p ON p.id = o.publicacion_id
          JOIN material m ON m.id = p.material_id
          JOIN usuario u ON u.id = o.reciclador_id
          JOIN comprador c ON c.id = o.comprador_id
         WHERE o.estado = 'COMPLETADA' AND o.completada_en >= ${desde} AND o.kg_final IS NOT NULL
           AND ((o.kg_final - p.cantidad_kg) * 100 >= ${u.desvioPct} * p.cantidad_kg OR o.kg_final >= ${u.kgOperacion})
        UNION ALL
        SELECT r.id, u.nombre, c.nombre_comercial, m.nombre,
               r.kg::float8, r.kg_confirmado::float8, r.creado_en, r.resuelto_en, 'DIRECTA'
          FROM registro_reciclaje r
          JOIN material m ON m.id = r.material_id
          JOIN usuario u ON u.id = r.reciclador_id
          JOIN comprador c ON c.id = r.comprador_id
         WHERE r.estado = 'CONFIRMADO' AND r.resuelto_en >= ${desde}
           AND ((r.kg_confirmado - r.kg) * 100 >= ${u.desvioPct} * r.kg OR r.kg_confirmado >= ${u.kgOperacion})
      ) t
       WHERE NOT EXISTS (SELECT 1 FROM alerta_descartada d WHERE d.tipo = 'PESO' AND d.clave = t.id::text)
       ORDER BY t.completada_en DESC
       LIMIT 50`;
    return {
      umbrales: u,
      dias,
      pares: pares.map((p) => ({
        clave: p.clave,
        reciclador: nombreCorto(p.reciclador),
        negocio: p.negocio,
        operacionesEn7Dias: p.maximo,
        operacionesEnPeriodo: p.total,
        ultima: p.ultima.toISOString(),
        operaciones: contexto
          .filter((c) => c.clave === p.clave)
          .slice(0, 6)
          .map((c) => ({ fecha: c.fecha.toISOString(), kg: c.kg, material: c.material, origen: c.origen })),
      })),
      pesos: pesos.map((p) => ({
        clave: p.id,
        operacionId: p.id,
        reciclador: nombreCorto(p.reciclador),
        negocio: p.negocio,
        material: p.material,
        kgPublicados: p.publicados,
        kgRecibidos: p.recibidos,
        desvioPct: Math.round(((p.recibidos - p.publicados) / p.publicados) * 100),
        publicadaEn: p.publicada_en.toISOString(),
        completadaEn: p.completada_en.toISOString(),
        origen: p.origen,
      })),
    };
  }

  // Descartar una alerta no cambia nada de las operaciones: queda el motivo y la auditoría
  async descartarAlerta(adminId: string, datos: { tipo: 'PAR' | 'PESO'; clave: string; motivo: string }) {
    const valida =
      datos.tipo === 'PESO'
        ? /^[0-9a-f-]{36}$/i.test(datos.clave) &&
          ((await this.prisma.operacion.count({ where: { id: datos.clave, estado: 'COMPLETADA' } })) > 0 ||
            (await this.prisma.registroReciclaje.count({ where: { id: datos.clave, estado: 'CONFIRMADO' } })) > 0)
        : /^[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(datos.clave);
    if (!valida) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa alerta.', 404);
    await this.prisma.$transaction(async (tx) => {
      await tx.alertaDescartada.create({
        data: { tipo: datos.tipo, clave: datos.clave, motivo: datos.motivo, adminId },
      });
      await auditar(tx, {
        adminId,
        tipo: 'REPORTES',
        accion: 'alerta_colusion_descartar',
        entidad: datos.tipo === 'PESO' ? 'operacion' : 'par_reciclador_negocio',
        entidadId: datos.clave.slice(0, 40),
        motivo: datos.motivo,
        despues: { tipo: datos.tipo },
      });
    });
    return { descartada: true };
  }

  private async umbrales(): Promise<Umbrales> {
    const filas = await this.prisma.parametro.findMany({
      where: {
        clave: { in: ['colusion_operaciones_par_7_dias', 'colusion_desvio_peso_pct', 'colusion_kg_operacion'] },
      },
      select: { clave: true, valor: true },
    });
    const valor = (clave: string, defecto: number) => {
      const numero = Number(filas.find((f) => f.clave === clave)?.valor);
      return Number.isFinite(numero) && numero > 0 ? numero : defecto;
    };
    return {
      operacionesPar: valor('colusion_operaciones_par_7_dias', 3),
      desvioPct: valor('colusion_desvio_peso_pct', 40),
      kgOperacion: valor('colusion_kg_operacion', 500),
    };
  }

  private acciones(tipo: TipoReporteAdmin, estado: ReporteEstado, oculta: boolean): AccionReporte[] {
    if (!ABIERTOS.includes(estado)) return [];
    if (tipo === 'RESENA') return oculta ? ['RESOLVER', 'DESCARTAR'] : ['OCULTAR_RESENA', 'DESCARTAR'];
    return estado === 'CORRECCION_PEDIDA' ? ['RESOLVER', 'DESCARTAR'] : ['PEDIR_CORRECCION', 'RESOLVER', 'DESCARTAR'];
  }

  private async decidir<T>(
    adminId: string,
    id: string,
    accion: AccionReporte,
    motivo: string,
    aplicar: (
      tx: ClienteBd,
      reporte: {
        motivo: string;
        estado: ReporteEstado;
        autorId: string;
        calificacionId: string | null;
        negocioUsuarioId: string | null;
      },
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const [bloqueo] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM reporte WHERE id = ${id}::uuid FOR UPDATE`;
      const reporte = bloqueo
        ? await tx.reporte.findUnique({
            where: { id },
            select: {
              tipo: true,
              motivo: true,
              estado: true,
              autorId: true,
              calificacionId: true,
              compradorId: true,
              comprador: { select: { usuarioId: true, nombreComercial: true } },
            },
          })
        : null;
      if (!reporte || reporte.tipo === 'OPERACION') {
        throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese reporte.', 404);
      }
      const permitidas = this.acciones(reporte.tipo, reporte.estado, await this.estaOculta(tx, reporte.calificacionId));
      if (!permitidas.includes(accion)) {
        throw new ErrorNegocio('DECISION_NO_VALIDA', 'Esa decisión no aplica al estado de este reporte.', 409);
      }
      const resultado = await aplicar(tx, {
        motivo: reporte.motivo,
        estado: reporte.estado,
        autorId: reporte.autorId,
        calificacionId: reporte.calificacionId,
        negocioUsuarioId: reporte.comprador?.usuarioId ?? null,
      });
      await auditar(tx, {
        adminId,
        tipo: 'REPORTES',
        accion: `reporte_${accion.toLowerCase()}`,
        entidad: reporte.tipo === 'RESENA' ? 'calificacion' : 'reporte',
        entidadId: reporte.tipo === 'RESENA' && reporte.calificacionId ? reporte.calificacionId : id,
        motivo,
        antes: { reporte: id, estado: reporte.estado, negocio: reporte.comprador?.nombreComercial ?? null },
        despues: resultado as object,
      });
      return resultado;
    });
  }

  private async estaOculta(tx: ClienteBd, calificacionId: string | null): Promise<boolean> {
    if (!calificacionId) return false;
    return (await tx.resenaOculta.count({ where: { calificacionId } })) > 0;
  }

  private async cerrar(tx: ClienteBd, id: string, estado: 'RESUELTO' | 'DESCARTADO', adminId: string, motivo: string) {
    await tx.reporte.update({
      where: { id },
      data: { estado, decision: motivo, resueltoPorId: adminId, resueltoEn: new Date() },
    });
  }

  private async avisarAutor(tx: ClienteBd, usuarioId: string, mensaje: string) {
    await this.notificaciones.crear(tx, {
      usuarioId,
      tipo: 'AVISO',
      titulo: 'Revisamos tu reporte',
      mensaje,
      obligatoria: true,
    });
  }
}
