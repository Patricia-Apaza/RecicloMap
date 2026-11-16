import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CodigoMaterial, PeriodoEstadisticas } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { UsuarioSesion } from '../../nucleo/seguridad/decoradores.js';
import { NegocioPublicacionesService } from '../publicaciones/negocio-publicaciones.service.js';
import { PreciosService } from '../precios/precios.service.js';
import { enTramo, horaEnLima, hoyEnLima, sumarDias, type Tramo, tramos } from './fechas.js';

const REQUIERE_PRO = { requierePro: true as const };
// Tamaño de cada barra: por día (7), por semana (30) y por mes de 30 días (90)
const TAMANO_TRAMO: Record<PeriodoEstadisticas, number> = { 7: 1, 30: 7, 90: 30 };

type FilaFecha = { fecha: string; material: CodigoMaterial | null; n: number };
const serie = (tramosDe: Tramo[], filas: Array<{ fecha: string; n: number }>) =>
  tramosDe.map((tramo) => ({
    desde: tramo.desde,
    hasta: tramo.hasta,
    valor: filas.filter((f) => enTramo(f.fecha, tramo)).reduce((suma, f) => suma + f.n, 0),
  }));
const porMaterial = (filas: FilaFecha[]) => {
  const mapa = new Map<CodigoMaterial, number>();
  for (const fila of filas) if (fila.material) mapa.set(fila.material, (mapa.get(fila.material) ?? 0) + fila.n);
  return [...mapa.entries()]
    .map(([material, cantidad]) => ({ material, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
};
const suma = (filas: Array<{ n: number }>) => filas.reduce((total, f) => total + f.n, 0);

// Pantallas 41, 50 y 53. Cada negocio ve solo lo suyo; los datos Pro no se envían al plan Gratis
@Injectable()
export class EstadisticasService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly configuracion: Configuracion,
    private readonly precios: PreciosService,
    private readonly cercanas: NegocioPublicacionesService,
  ) {}

  async estadisticas(usuario: UsuarioSesion, periodo: PeriodoEstadisticas) {
    const compradorId = this.negocio(usuario);
    const hoy = hoyEnLima();
    const pro = await this.esPro(compradorId, hoy);
    const base = { periodo, plan: pro ? ('PRO' as const) : ('GRATIS' as const), zonaHoraria: 'America/Lima' };
    // El plan Gratis no recibe nada de 90 días: ni siquiera las cifras que sí tiene en 7 y 30
    if (periodo === 90 && !pro) return { ...base, ...REQUIERE_PRO };

    const desde = sumarDias(hoy, -(periodo - 1));
    const [visitas, llegadas, kg, ofertas, horas, consultados, mercado] = await Promise.all([
      this.visitas(compradorId, desde, hoy),
      this.llegadas(compradorId, desde, hoy),
      this.kilos(compradorId, desde, hoy),
      this.ofertas(compradorId, desde, hoy),
      pro ? this.horas(compradorId, desde, hoy) : null,
      pro ? this.consultados(compradorId, desde, hoy) : null,
      this.precioFrenteAlMercado(usuario),
    ]);
    const barras = tramos(desde, hoy, TAMANO_TRAMO[periodo]);
    const totalVisitas = suma(visitas);
    const totalLlegadas = suma(llegadas);
    const totalKg = kg.reduce((total, f) => total + f.kg, 0);
    return {
      ...base,
      desde,
      hasta: hoy,
      // Sin ninguna actividad real no se dibujan ceros que parezcan una falla
      sinDatos: totalVisitas + totalLlegadas + ofertas.enviadas + totalKg === 0,
      visitas: { total: totalVisitas, serie: serie(barras, visitas) },
      llegadas: { total: totalLlegadas, porMaterial: porMaterial(llegadas), serie: serie(barras, llegadas) },
      ofertas,
      kg: {
        total: Number(totalKg.toFixed(2)),
        compras: kg.reduce((total, f) => total + f.compras, 0),
        serie: barras.map((tramo) => ({
          desde: tramo.desde,
          hasta: tramo.hasta,
          valor: Number(
            kg
              .filter((f) => enTramo(f.fecha, tramo))
              .reduce((total, f) => total + f.kg, 0)
              .toFixed(2),
          ),
        })),
        porMaterial: this.kgPorMaterial(kg),
      },
      precioFrenteAlMercado: mercado,
      horasConMasVisitas: horas ?? REQUIERE_PRO,
      materialesMasConsultados: consultados ?? REQUIERE_PRO,
    };
  }

  // Pantalla 41: el mes en curso, las últimas 8 semanas y lo que conviene hacer hoy
  async resumen(usuario: UsuarioSesion) {
    const compradorId = this.negocio(usuario);
    const hoy = hoyEnLima();
    const inicioMes = `${hoy.slice(0, 8)}01`;
    const mesAnterior = sumarDias(inicioMes, -1).slice(0, 8) + '01';
    const [pro, kgMes, kgMesAnterior, visitasMes, llegadasMes, kgSemanas, ultimas, mercado, correcciones, cerca] =
      await Promise.all([
        this.esPro(compradorId, hoy),
        this.kilos(compradorId, inicioMes, hoy),
        this.kilos(compradorId, mesAnterior, sumarDias(inicioMes, -1)),
        this.visitas(compradorId, inicioMes, hoy),
        this.llegadas(compradorId, inicioMes, hoy),
        this.kilos(compradorId, sumarDias(hoy, -55), hoy),
        this.prisma.solicitudLlegada.findMany({
          where: { compradorId },
          orderBy: { creadaEn: 'desc' },
          take: 5,
          select: { creadaEn: true, material: { select: { codigo: true, nombre: true } } },
        }),
        this.precioFrenteAlMercado(usuario),
        this.prisma.reporte.count({ where: { tipo: 'NEGOCIO', compradorId, estado: 'CORRECCION_PEDIDA' } }),
        this.cercanas.cercanas(usuario, undefined, 1, 50),
      ]);
    const totalMes = kgMes.reduce((total, f) => total + f.kg, 0);
    const totalAnterior = kgMesAnterior.reduce((total, f) => total + f.kg, 0);
    const semanas = tramos(sumarDias(hoy, -55), hoy, 7);
    const nuevasHoy = cerca.datos.filter((p) => p.compraEsteMaterial && hoyEnLima(new Date(p.creadaEn)) === hoy).length;
    return {
      plan: pro ? ('PRO' as const) : ('GRATIS' as const),
      mes: inicioMes.slice(0, 7),
      kgRecibidos: {
        total: Number(totalMes.toFixed(2)),
        // Sin mes anterior con datos no hay comparación: no se inventa una tendencia
        frenteAlMesAnterior: totalAnterior > 0 ? Math.round(((totalMes - totalAnterior) / totalAnterior) * 100) : null,
      },
      visitas: suma(visitasMes),
      solicitudesLlegada: suma(llegadasMes),
      kilosPorSemana: semanas.map((tramo) => ({
        desde: tramo.desde,
        hasta: tramo.hasta,
        valor: Number(
          kgSemanas
            .filter((f) => enTramo(f.fecha, tramo))
            .reduce((total, f) => total + f.kg, 0)
            .toFixed(2),
        ),
      })),
      sinDatos: totalMes + totalAnterior + suma(visitasMes) + suma(llegadasMes) === 0 && kgSemanas.length === 0,
      ultimasSolicitudes: ultimas.map((s) => ({ material: s.material, cuando: s.creadaEn.toISOString() })),
      paraHacerHoy: {
        preciosAntiguos: mercado.filter((m) => m.antiguo).length,
        publicacionesNuevas: nuevasHoy,
        correccionesPendientes: correcciones,
      },
      publicacionesCerca: {
        total: cerca.total,
        datos: cerca.datos
          .slice(0, 3)
          .map((p) => ({ id: p.id, material: p.material, kg: p.kg, tramo: p.tramo, creadaEn: p.creadaEn })),
      },
      precioFrenteAlMercado: mercado,
    };
  }

  // RN-17: el negocio no sabe quién visitó; solo cuenta una persona o dispositivo por día
  async registrarVisita(
    compradorId: string,
    visitante: { usuario?: UsuarioSesion; dispositivo?: string; huella: string },
    material: CodigoMaterial | null,
  ): Promise<{ registrada: boolean }> {
    if (visitante.usuario && visitante.usuario.rol !== 'RECICLADOR') return { registrada: false };
    const negocio = await this.prisma.comprador.findFirst({
      where: { id: compradorId, estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
      select: { id: true },
    });
    if (!negocio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio.', 404);
    const ahora = new Date();
    const fecha = hoyEnLima(ahora);
    const clave = visitante.usuario ? `u:${visitante.usuario.id}` : `d:${visitante.dispositivo ?? visitante.huella}`;
    // La huella cambia cada día y por negocio: no sirve para seguir a nadie entre días ni entre negocios
    const huella = createHmac('sha256', Buffer.from(this.configuracion.jwtSecreto))
      .update(`${compradorId}|${fecha}|${clave}`)
      .digest('hex');
    const materialId = material
      ? ((await this.prisma.material.findUnique({ where: { codigo: material }, select: { id: true } }))?.id ?? null)
      : null;
    const insertadas = await this.prisma.$executeRaw`
      INSERT INTO evento_visita (comprador_id, material_id, fecha, hora, visitante)
      VALUES (${compradorId}::uuid, ${materialId}, ${fecha}::date, ${horaEnLima(ahora)}, ${huella})
      ON CONFLICT (comprador_id, fecha, visitante) DO NOTHING`;
    return { registrada: insertadas > 0 };
  }

  // ———— consultas ————

  private async esPro(compradorId: string, hoy: string): Promise<boolean> {
    const fila = await this.prisma.comprador.findUniqueOrThrow({
      where: { id: compradorId },
      select: { plan: true, planDesde: true, planHasta: true },
    });
    return (
      fila.plan === 'PRO' &&
      !!fila.planDesde &&
      !!fila.planHasta &&
      fila.planDesde.toISOString().slice(0, 10) <= hoy &&
      hoy <= fila.planHasta.toISOString().slice(0, 10)
    );
  }

  private visitas(compradorId: string, desde: string, hasta: string) {
    return this.prisma.$queryRaw<FilaFecha[]>`
      SELECT fecha::text AS fecha, NULL::text AS material, count(*)::int AS n
        FROM evento_visita
       WHERE comprador_id = ${compradorId}::uuid AND fecha BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY fecha`;
  }

  private llegadas(compradorId: string, desde: string, hasta: string) {
    return this.prisma.$queryRaw<FilaFecha[]>`
      SELECT s.fecha::text AS fecha, m.codigo AS material, count(*)::int AS n
        FROM solicitud_llegada s LEFT JOIN material m ON m.id = s.material_id
       WHERE s.comprador_id = ${compradorId}::uuid AND s.fecha BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY s.fecha, m.codigo`;
  }

  // Solo operaciones completadas, con los kilos que confirmó el negocio
  private async kilos(compradorId: string, desde: string, hasta: string) {
    const filas = await this.prisma.$queryRaw<
      Array<{ fecha: string; material: CodigoMaterial; kg: number; compras: number }>
    >`
      SELECT (o.completada_en AT TIME ZONE 'America/Lima')::date::text AS fecha, m.codigo AS material,
             sum(o.kg_final)::float8 AS kg, count(*)::int AS compras
        FROM operacion o JOIN publicacion p ON p.id = o.publicacion_id JOIN material m ON m.id = p.material_id
       WHERE o.comprador_id = ${compradorId}::uuid AND o.estado = 'COMPLETADA' AND o.kg_final IS NOT NULL
         AND (o.completada_en AT TIME ZONE 'America/Lima')::date BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY 1, 2`;
    return filas;
  }

  private kgPorMaterial(filas: Array<{ material: CodigoMaterial; kg: number }>) {
    const mapa = new Map<CodigoMaterial, number>();
    for (const fila of filas) mapa.set(fila.material, (mapa.get(fila.material) ?? 0) + fila.kg);
    const total = [...mapa.values()].reduce((a, b) => a + b, 0);
    return [...mapa.entries()]
      .map(([material, kg]) => ({
        material,
        kg: Number(kg.toFixed(2)),
        porcentaje: total > 0 ? Math.round((kg / total) * 100) : 0,
      }))
      .sort((a, b) => b.kg - a.kg);
  }

  private async ofertas(compradorId: string, desde: string, hasta: string) {
    const [fila] = await this.prisma.$queryRaw<Array<{ enviadas: number; aceptadas: number }>>`
      SELECT count(*) FILTER (WHERE estado <> 'RETIRADA')::int AS enviadas,
             count(*) FILTER (WHERE estado = 'ACEPTADA')::int AS aceptadas
        FROM oferta
       WHERE comprador_id = ${compradorId}::uuid
         AND (creada_en AT TIME ZONE 'America/Lima')::date BETWEEN ${desde}::date AND ${hasta}::date`;
    return { enviadas: fila?.enviadas ?? 0, aceptadas: fila?.aceptadas ?? 0 };
  }

  private horas(compradorId: string, desde: string, hasta: string) {
    return this.prisma.$queryRaw<Array<{ hora: number; visitas: number }>>`
        SELECT hora::int AS hora, count(*)::int AS visitas FROM evento_visita
         WHERE comprador_id = ${compradorId}::uuid AND fecha BETWEEN ${desde}::date AND ${hasta}::date
         GROUP BY hora ORDER BY hora`;
  }

  private async consultados(compradorId: string, desde: string, hasta: string) {
    const filas = await this.prisma.$queryRaw<Array<{ material: CodigoMaterial; consultas: number }>>`
      SELECT m.codigo AS material, count(*)::int AS consultas
        FROM evento_visita v JOIN material m ON m.id = v.material_id
       WHERE v.comprador_id = ${compradorId}::uuid AND v.fecha BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY m.codigo ORDER BY consultas DESC`;
    const total = filas.reduce((suma_, f) => suma_ + f.consultas, 0);
    return filas.map((f) => ({ ...f, porcentaje: total > 0 ? Math.round((f.consultas / total) * 100) : 0 }));
  }

  // Mismo semáforo y conjunto que el mapa, sin nombres ni precios de otros negocios
  private async precioFrenteAlMercado(usuario: UsuarioSesion) {
    const propios = await this.precios.misPrecios(usuario);
    return propios.materiales
      .filter((m) => m.activo)
      .map((m) => ({
        material: m.material,
        min: m.min,
        max: m.max,
        demanda: m.demanda,
        actualizadoEn: m.actualizadoEn,
        antiguo: m.antiguo,
        semaforo: m.semaforo,
        moderacion: m.moderacion ? { estado: m.moderacion.estado, motivo: m.moderacion.motivo } : null,
      }));
  }

  private negocio(usuario: UsuarioSesion): string {
    if (!usuario.compradorId) throw new ErrorNegocio('SIN_NEGOCIO', 'Primero completa el registro de tu negocio.', 409);
    return usuario.compradorId;
  }
}
