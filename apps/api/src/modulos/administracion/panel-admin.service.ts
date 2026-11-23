import { Injectable } from '@nestjs/common';
import { type CodigoMaterial, type PeriodoPanel, reglaDe } from '@reciclomap/shared';
import { PrismaAdmin } from '../../nucleo/base-datos/prisma.js';
import { hoyEnLima, sumarDias } from '../estadisticas/fechas.js';

const inicio = (fecha: string) => new Date(`${fecha}T00:00:00-05:00`);
const ABIERTOS = ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] as const;
const lunesDe = (fecha: string) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
};

// Panel de inicio: lo pendiente y métricas reales de la plataforma. Nada individual: solo conteos
@Injectable()
export class PanelAdminService {
  constructor(private readonly prisma: PrismaAdmin) {}

  async pendientes() {
    const [verificaciones, cambios, reportes, incidencias, solicitudesPlan, precios, antiguas] = await Promise.all([
      this.prisma.verificacion.count({ where: { estado: 'EN_REVISION', tipo: 'REGISTRO' } }),
      this.prisma.verificacion.count({ where: { estado: 'EN_REVISION', tipo: 'CAMBIO_DIRECCION' } }),
      this.prisma.reporte.count({ where: { tipo: { in: ['NEGOCIO', 'RESENA'] }, estado: { in: [...ABIERTOS] } } }),
      this.prisma.reporte.count({ where: { tipo: 'OPERACION', estado: { in: [...ABIERTOS] } } }),
      this.prisma.solicitudPlan.count({ where: { estado: 'PENDIENTE' } }),
      this.prisma.moderacionPrecio.count({ where: { cerradaEn: null } }),
      this.antiguas(),
    ]);
    return {
      total: verificaciones + cambios + reportes + incidencias + solicitudesPlan,
      verificaciones,
      cambiosDireccion: cambios,
      reportes,
      incidencias,
      solicitudesPlan,
      preciosMarcados: precios,
      masAntiguos: antiguas,
    };
  }

  // «Para revisar hoy»: lo más antiguo primero, sin nombres de personas
  private async antiguas() {
    const [ver, rep, plan] = await Promise.all([
      this.prisma.verificacion.findMany({
        where: { estado: 'EN_REVISION' },
        orderBy: { creadaEn: 'asc' },
        take: 5,
        select: { tipo: true, creadaEn: true, comprador: { select: { nombreComercial: true } } },
      }),
      this.prisma.reporte.findMany({
        where: { estado: { in: [...ABIERTOS] } },
        orderBy: { creadoEn: 'asc' },
        take: 5,
        select: { tipo: true, creadoEn: true },
      }),
      this.prisma.solicitudPlan.findMany({
        where: { estado: 'PENDIENTE' },
        orderBy: { creadaEn: 'asc' },
        take: 5,
        select: { creadaEn: true, comprador: { select: { nombreComercial: true } } },
      }),
    ]);
    const filas = [
      ...ver.map((v) => ({
        tipo: v.tipo === 'CAMBIO_DIRECCION' ? 'CAMBIO_DIRECCION' : 'VERIFICACION',
        titulo: `${v.tipo === 'CAMBIO_DIRECCION' ? 'Cambio de dirección' : 'Verificación'} · ${v.comprador.nombreComercial}`,
        desde: v.creadaEn,
        enlace: '/admin/verificaciones',
      })),
      ...rep.map((r) => ({
        tipo: r.tipo === 'OPERACION' ? 'INCIDENCIA' : 'REPORTE',
        titulo:
          r.tipo === 'OPERACION'
            ? 'Incidencia de una operación'
            : r.tipo === 'RESENA'
              ? 'Reporte de una reseña'
              : 'Reporte sobre un negocio',
        desde: r.creadoEn,
        enlace: r.tipo === 'OPERACION' ? '/admin/incidencias' : '/admin/reportes',
      })),
      ...plan.map((p) => ({
        tipo: 'PLAN',
        titulo: `Solicitud del plan Pro · ${p.comprador.nombreComercial}`,
        desde: p.creadaEn,
        enlace: '/admin/plan',
      })),
    ];
    return filas.sort((a, b) => a.desde.getTime() - b.desde.getTime()).slice(0, 8);
  }

  async metricas(periodo: PeriodoPanel) {
    const hoy = hoyEnLima();
    const desde = inicio(sumarDias(hoy, -(periodo - 1)));
    const lunes = lunesDe(hoy);
    const semanas = Array.from({ length: 8 }, (_, i) => sumarDias(lunes, -7 * (7 - i)));

    const [
      porRol,
      porCiudad,
      nuevos,
      suspendidos,
      centros,
      moviles,
      ops,
      enCurso,
      kgOps,
      kgDirecto,
      incidencias,
      publicaciones,
      conOfertas,
      aceptadas,
      completadasDeLasAceptadas,
      altas,
    ] = await Promise.all([
      this.prisma.usuario.groupBy({ by: ['rol'], where: { estado: { not: 'ELIMINADO' } }, _count: { _all: true } }),
      this.prisma.usuario.groupBy({
        by: ['ciudadId'],
        where: { estado: { not: 'ELIMINADO' } },
        _count: { _all: true },
      }),
      this.prisma.usuario.count({ where: { estado: { not: 'ELIMINADO' }, creadoEn: { gte: desde } } }),
      this.prisma.usuario.count({ where: { estado: 'SUSPENDIDO' } }),
      this.prisma.comprador.count({ where: { tipo: 'CENTRO', estadoVerificacion: 'APROBADO' } }),
      this.prisma.comprador.count({ where: { tipo: 'MOVIL', estadoVerificacion: 'APROBADO' } }),
      this.prisma.operacion.groupBy({
        by: ['estado'],
        where: {
          OR: [
            { estado: 'COMPLETADA', completadaEn: { gte: desde } },
            { estado: 'CANCELADA', canceladaEn: { gte: desde } },
          ],
        },
        _count: { _all: true },
      }),
      this.prisma.operacion.count({
        where: { estado: { in: ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'] } },
      }),
      this.prisma.$queryRaw<Array<{ material: CodigoMaterial; kg: number }>>`
          SELECT m.codigo AS material, COALESCE(sum(o.kg_final), 0)::float8 AS kg
            FROM operacion o JOIN publicacion p ON p.id = o.publicacion_id JOIN material m ON m.id = p.material_id
           WHERE o.estado = 'COMPLETADA' AND o.completada_en >= ${desde} GROUP BY m.codigo`,
      this.prisma.$queryRaw<Array<{ material: CodigoMaterial; kg: number }>>`
          SELECT m.codigo AS material, COALESCE(sum(r.kg_confirmado), 0)::float8 AS kg
            FROM registro_reciclaje r JOIN material m ON m.id = r.material_id
           WHERE r.estado = 'CONFIRMADO' AND r.resuelto_en >= ${desde} GROUP BY m.codigo`,
      Promise.all([
        this.prisma.reporte.count({ where: { tipo: 'OPERACION', estado: { in: [...ABIERTOS] } } }),
        this.prisma.reporte.count({ where: { tipo: 'OPERACION', creadoEn: { gte: desde } } }),
        this.prisma.reporte.count({ where: { tipo: 'OPERACION', resueltoEn: { gte: desde } } }),
      ]),
      this.prisma.publicacion.count({ where: { creadaEn: { gte: desde } } }),
      this.prisma.publicacion.count({ where: { creadaEn: { gte: desde }, ofertas: { some: {} } } }),
      this.prisma.operacion.count({ where: { creadaEn: { gte: desde } } }),
      this.prisma.operacion.count({ where: { creadaEn: { gte: desde }, estado: 'COMPLETADA' } }),
      this.prisma.$queryRaw<Array<{ semana: string; n: number }>>`
          SELECT to_char(date_trunc('week', creado_en AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD') AS semana, count(*)::int AS n
            FROM usuario WHERE estado <> 'ELIMINADO' AND creado_en >= ${inicio(semanas[0]!)} GROUP BY 1`,
    ]);

    const ciudades = await this.prisma.ciudad.findMany({ select: { id: true, nombre: true } });
    const cuenta = (e: string) => ops.find((o) => o.estado === e)?._count._all ?? 0;
    const completadas = cuenta('COMPLETADA');
    const canceladas = cuenta('CANCELADA');
    const kg = new Map<CodigoMaterial, number>();
    for (const f of [...kgOps, ...kgDirecto]) kg.set(f.material, (kg.get(f.material) ?? 0) + f.kg);
    const kgTotal = [...kg.values()].reduce((a, b) => a + b, 0);
    const rol = (r: string) => porRol.find((x) => x.rol === r)?._count._all ?? 0;
    const sinDatos = completadas + canceladas + publicaciones + nuevos === 0 && kgTotal === 0;
    return {
      periodo,
      desde: sumarDias(hoy, -(periodo - 1)),
      hasta: hoy,
      zonaHoraria: 'America/Lima',
      sinDatos,
      usuarios: {
        total: porRol.reduce((s, r) => s + r._count._all, 0),
        porRol: {
          RECICLADOR: rol('RECICLADOR'),
          CENTRO: rol('CENTRO'),
          COMPRADOR_MOVIL: rol('COMPRADOR_MOVIL'),
          ADMIN: rol('ADMIN'),
        },
        porCiudad: porCiudad
          .map((c) => ({ ciudad: ciudades.find((x) => x.id === c.ciudadId)?.nombre ?? 'Otra', total: c._count._all }))
          .sort((a, b) => b.total - a.total),
        nuevos,
        suspendidos,
        porSemana: semanas.map((s) => ({ desde: s, valor: altas.find((a) => a.semana === s)?.n ?? 0 })),
      },
      negocios: { centrosVerificados: centros, movilesVerificados: moviles },
      operaciones: {
        completadas,
        canceladas,
        enCurso,
        // Completadas entre las que terminaron en el período; sin operaciones terminadas no hay tasa
        tasaCierre:
          completadas + canceladas > 0 ? Math.round((completadas / (completadas + canceladas)) * 1000) / 10 : null,
      },
      kilos: {
        total: Math.round(kgTotal * 100) / 100,
        porMaterial: [...kg.entries()]
          .map(([material, k]) => ({ material, kg: Math.round(k * 100) / 100 }))
          .sort((a, b) => b.kg - a.kg),
      },
      incidencias: { abiertas: incidencias[0], creadas: incidencias[1], resueltas: incidencias[2] },
      embudo: { publicaciones, conOfertas, aceptadas, completadas: completadasDeLasAceptadas },
    };
  }

  // Bloques de configuración: solo conteos
  async bloques(periodo: PeriodoPanel) {
    const desde = inicio(sumarDias(hoyEnLima(), -(periodo - 1)));
    const [parametros, ciudades, espera, pausa, stockBajo, usados, porEntregar, porVencer, premios] = await Promise.all(
      [
        this.prisma.parametroHistorial.findMany({
          where: { clave: { not: 'ruleta_en_pausa' } },
          orderBy: { creadoEn: 'desc' },
          take: 5,
          select: { clave: true, valorAnterior: true, valorNuevo: true, creadoEn: true },
        }),
        this.prisma.ciudad.findMany({
          orderBy: [{ estado: 'asc' }, { nombre: 'asc' }],
          select: { id: true, nombre: true, estado: true },
        }),
        this.prisma.listaEsperaCiudad.groupBy({ by: ['ciudadId'], _count: { _all: true } }),
        this.prisma.parametro.findUnique({ where: { clave: 'ruleta_en_pausa' } }),
        this.prisma.parametro.findUnique({ where: { clave: 'premio_stock_bajo' } }),
        this.prisma.sorteoRuleta.count({ where: { creadoEn: { gte: desde } } }),
        this.prisma.premioGanado.count({ where: { estado: 'RECLAMADO' } }),
        this.prisma.premioGanado.count({
          where: { estado: 'POR_RECLAMAR', venceEn: { gt: new Date(), lte: new Date(Date.now() + 3 * 86_400_000) } },
        }),
        this.prisma.premio.findMany({ where: { activo: true }, select: { stock: true } }),
      ],
    );
    const umbral = Number(stockBajo?.valor) > 0 ? Number(stockBajo?.valor) : 5;
    return {
      parametros: parametros.map((p) => ({
        clave: p.clave,
        etiqueta: reglaDe(p.clave)?.etiqueta ?? p.clave,
        anterior: p.valorAnterior,
        nuevo: p.valorNuevo,
        fecha: p.creadoEn,
      })),
      ciudades: ciudades.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        listaEspera: espera.find((e) => e.ciudadId === c.id)?._count._all ?? 0,
      })),
      ruleta: {
        enPausa: pausa?.valor === '1',
        girosUsados: usados,
        premiosPorEntregar: porEntregar,
        premiosPorVencer: porVencer,
        stockBajo: premios.filter((p) => p.stock !== null && p.stock <= umbral).length,
      },
    };
  }

  async resumen(periodo: PeriodoPanel) {
    const [pendientes, metricas, bloques] = await Promise.all([
      this.pendientes(),
      this.metricas(periodo),
      this.bloques(periodo),
    ]);
    return { pendientes, metricas, bloques };
  }
}
