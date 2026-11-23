import { Injectable } from '@nestjs/common';
import type { AlcanceRanking } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { hoyEnLima, sumarDias } from '../estadisticas/fechas.js';
import { calificacionPublica } from '../publicaciones/vistas.js';
import { nombreCorto } from '../publicaciones/textos.js';
import { extraReclamoHoras, limiteDeReclamo, progresoDesafio, VENTANA_RECLAMO_DIAS } from './desafios.js';
import { CRITERIOS, medir } from './insignias.js';
import { numeroParametro, ProgresoService } from './progreso.service.js';
import { lunesDe, primerDiaDelMes, primerDiaDelMesAnterior, primerDiaDelMesSiguiente } from './semanas.js';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const nombreDelMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? '';
const numero = (valor: { toString(): string } | number | null | undefined) => Number(valor ?? 0);
const kilos = (kg: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(kg);

@Injectable()
export class JuegoService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly progreso: ProgresoService,
  ) {}

  private async perfil(usuarioId: string) {
    const perfil = await this.prisma.recicladorPerfil.findUnique({
      where: { usuarioId },
      select: {
        kgTotal: true,
        puntos: true,
        nivel: { select: { id: true, nombre: true } },
        codigoInvitacion: true,
        operacionesCompletadas: true,
        califProm: true,
        califCant: true,
      },
    });
    if (!perfil) throw new ErrorNegocio('SIN_PERMISO', 'Esta sección es para recicladores.', 403);
    return perfil;
  }

  private async escalera() {
    const niveles = await this.prisma.nivel.findMany({ orderBy: { kgMin: 'asc' } });
    return niveles.map((n) => ({ numero: n.id, nombre: n.nombre, kgMin: numero(n.kgMin) }));
  }

  private descripcionDe(movimiento: {
    motivo: string;
    puntos: number;
    operacion: { kgFinal: unknown; publicacion: { material: { nombre: string } } } | null;
    registro: { kgConfirmado: unknown; material: { nombre: string } } | null;
    desafio: { plantilla: { nombre: string } } | null;
    invitado: { nombre: string } | null;
    invitadoId: string | null;
    usuarioId: string;
  }): string {
    switch (movimiento.motivo) {
      case 'OPERACION':
        return `Operación completada · ${movimiento.operacion?.publicacion.material.nombre ?? ''} ${kilos(numero(movimiento.operacion?.kgFinal as number))} kg`;
      case 'REGISTRO_DIRECTO':
        return `Entrega directa confirmada · ${movimiento.registro?.material.nombre ?? ''} ${kilos(numero(movimiento.registro?.kgConfirmado as number))} kg`;
      case 'DESAFIO':
        return `Desafío: ${movimiento.desafio?.plantilla.nombre ?? ''}`;
      case 'INVITACION':
        return movimiento.invitadoId === movimiento.usuarioId
          ? 'Bienvenida: te invitó un amigo'
          : `Amigo invitado: ${nombreCorto(movimiento.invitado?.nombre ?? 'Amigo')}`;
      case 'RULETA':
        return 'Premio de la ruleta';
      default:
        return 'Ajuste del sistema';
    }
  }

  // Pantalla 30: puntos, kilos, nivel, giros, historial, invitación y desafíos
  async puntos(usuarioId: string) {
    const perfil = await this.perfil(usuarioId);
    const niveles = await this.escalera();
    const kg = numero(perfil.kgTotal);
    const siguiente = niveles.find((n) => n.kgMin > kg) ?? null;
    const movimientos = await this.prisma.movimientoPuntos.findMany({
      where: { usuarioId },
      orderBy: { creadoEn: 'desc' },
      take: 20,
      include: {
        operacion: { select: { kgFinal: true, publicacion: { select: { material: { select: { nombre: true } } } } } },
        registro: { select: { kgConfirmado: true, material: { select: { nombre: true } } } },
        desafio: { select: { plantilla: { select: { nombre: true } } } },
        invitado: { select: { nombre: true } },
      },
    });
    const [invitados, contadas, ganados, desafios] = await Promise.all([
      this.prisma.invitacion.count({ where: { invitadorId: usuarioId } }),
      this.prisma.invitacion.count({ where: { invitadorId: usuarioId, contadaEn: { not: null } } }),
      this.prisma.movimientoPuntos.aggregate({
        where: { usuarioId, motivo: 'INVITACION', invitadoId: { not: usuarioId } },
        _sum: { puntos: true },
      }),
      this.desafios(usuarioId),
    ]);
    const [girosDisponibles, puntosPorGiro, reciclaje] = await Promise.all([
      this.prisma.giro.count({ where: { usuarioId, usadoEn: null } }),
      numeroParametro(this.prisma, 'puntos_por_giro', 500),
      this.prisma.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId }, select: { puntosReciclaje: true } }),
    ]);
    const avanceGiro = reciclaje.puntosReciclaje % puntosPorGiro;
    return {
      puntos: perfil.puntos,
      kgTotal: kg,
      nivel: { numero: perfil.nivel.id, nombre: perfil.nivel.nombre },
      siguiente: siguiente
        ? { nombre: siguiente.nombre, kgMin: siguiente.kgMin, faltan: Math.ceil((siguiente.kgMin - kg) * 100) / 100 }
        : null,
      niveles,
      giros: { disponibles: girosDisponibles, puntosPorGiro, avance: avanceGiro, faltan: puntosPorGiro - avanceGiro },
      movimientos: movimientos.map((m) => ({
        id: m.id,
        descripcion: this.descripcionDe(m),
        puntos: m.puntos,
        fecha: m.creadoEn,
      })),
      invitacion: {
        codigo: perfil.codigoInvitacion,
        invitados,
        completaron: contadas,
        puntosGanados: ganados._sum.puntos ?? 0,
        puntosPorInvitado: await numeroParametro(this.prisma, 'puntos_por_invitacion', 10),
      },
      desafios: { mes: desafios.mesTexto, items: desafios.datos.filter((d) => !d.delMesAnterior).slice(0, 3) },
    };
  }

  // Pantalla 31: kilos por semana de las últimas 8 semanas, con operaciones completadas y entregas confirmadas
  async niveles(usuarioId: string) {
    const perfil = await this.perfil(usuarioId);
    const niveles = await this.escalera();
    const kg = numero(perfil.kgTotal);
    const hoy = hoyEnLima();
    const primera = sumarDias(lunesDe(hoy), -49);
    const filas = await this.prisma.$queryRaw<Array<{ semana: string; kg: number }>>`
      SELECT to_char(date_trunc('week', cuando AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD') AS semana, sum(kg)::float8 AS kg
        FROM (
          SELECT completada_en AS cuando, kg_final AS kg FROM operacion
           WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'COMPLETADA' AND completada_en IS NOT NULL
          UNION ALL
          SELECT resuelto_en, kg_confirmado FROM registro_reciclaje
           WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'CONFIRMADO' AND resuelto_en IS NOT NULL
        ) a
       WHERE cuando >= (${primera}::date)::timestamp AT TIME ZONE 'America/Lima'
       GROUP BY 1`;
    const porSemana = new Map(filas.map((f) => [f.semana, f.kg]));
    const semanas = Array.from({ length: 8 }, (_, i) => {
      const lunes = sumarDias(primera, i * 7);
      return { lunes, kg: Math.round((porSemana.get(lunes) ?? 0) * 100) / 100 };
    });
    const siguiente = niveles.find((n) => n.kgMin > kg) ?? null;
    return {
      kgTotal: kg,
      nivel: { numero: perfil.nivel.id, nombre: perfil.nivel.nombre },
      siguiente: siguiente
        ? { nombre: siguiente.nombre, kgMin: siguiente.kgMin, faltan: Math.ceil((siguiente.kgMin - kg) * 100) / 100 }
        : null,
      niveles,
      semanas,
    };
  }

  // Pantallas 14 y 37: el progreso de cada una de las 12 insignias se calcula aquí
  async insignias(usuarioId: string) {
    await this.perfil(usuarioId);
    await this.progreso.evaluar(usuarioId, { silencioso: true });
    const [catalogo, propias, medidas] = await Promise.all([
      this.prisma.insignia.findMany({ orderBy: { orden: 'asc' } }),
      this.prisma.usuarioInsignia.findMany({ where: { usuarioId } }),
      medir(this.prisma, usuarioId),
    ]);
    const obtenidas = new Map(propias.map((p) => [p.insigniaId, p.obtenidaEn]));
    const datos = catalogo.map((i) => {
      const actual = CRITERIOS[i.codigo]?.actual(medidas) ?? 0;
      const obtenidaEn = obtenidas.get(i.id) ?? null;
      return {
        codigo: i.codigo,
        nombre: i.nombre,
        categoria: i.categoria,
        descripcion: i.descripcion,
        unidad: i.unidad,
        meta: i.meta,
        actual: Math.min(Math.floor(actual), i.meta),
        lograda: obtenidaEn !== null,
        obtenidaEn,
        destacada: i.destacada,
      };
    });
    return { logradas: datos.filter((d) => d.lograda).length, total: datos.length, datos };
  }

  // Pantalla 33: desafíos del mes y, hasta 7 días después de terminar, los del mes anterior que se pueden reclamar
  async desafios(usuarioId: string) {
    await this.perfil(usuarioId);
    const hoy = hoyEnLima();
    const mesActual = primerDiaDelMes(hoy);
    await this.progreso.asegurarDesafiosDelMes(mesActual);
    await this.progreso.evaluar(usuarioId, { silencioso: true });
    const anterior = primerDiaDelMesAnterior(mesActual);
    const ventana = await numeroParametro(this.prisma, 'desafio_reclamo_dias', VENTANA_RECLAMO_DIAS);
    const extraAnterior = await extraReclamoHoras(this.prisma, anterior);
    const hastaAnterior = limiteDeReclamo(anterior, ventana, extraAnterior);
    const meses = [mesActual, ...(hoy <= hastaAnterior ? [anterior] : [])];
    const desafios = await this.prisma.desafio.findMany({
      where: { mes: { in: meses.map((m) => new Date(`${m}T00:00:00Z`)) } },
      include: {
        plantilla: { include: { material: { select: { codigo: true, nombre: true } } } },
        usuarios: { where: { usuarioId } },
      },
      orderBy: [{ mes: 'desc' }, { esMetaMes: 'desc' }, { plantillaId: 'asc' }],
    });
    const datos = [];
    for (const d of desafios) {
      const mes = d.mes.toISOString().slice(0, 10);
      const meta = numero(d.meta);
      const avance = await progresoDesafio(this.prisma, usuarioId, d.plantilla, mes);
      const propio = d.usuarios[0];
      const delMesAnterior = mes !== mesActual;
      const completado = avance >= meta;
      const reclamado = propio?.reclamadoEn != null;
      // Del mes anterior solo interesa lo que se puede reclamar o ya se reclamó
      if (delMesAnterior && !completado) continue;
      datos.push({
        id: d.id,
        nombre: d.plantilla.nombre,
        descripcion: d.plantilla.descripcion,
        material: d.plantilla.material,
        meta,
        unidad: d.plantilla.unidad,
        puntos: d.puntos,
        esMetaMes: d.esMetaMes,
        otorgaGiro: d.esMetaMes,
        progreso: Math.min(avance, meta),
        estado: reclamado ? 'RECLAMADO' : completado ? 'COMPLETADO' : 'EN_PROGRESO',
        delMesAnterior,
        reclamableHasta:
          completado && !reclamado
            ? delMesAnterior
              ? hastaAnterior
              : limiteDeReclamo(mes, ventana, d.reclamoExtraHoras)
            : null,
      });
    }
    const diasParaRenovar = Math.round(
      (new Date(`${primerDiaDelMesSiguiente(mesActual)}T12:00:00Z`).getTime() -
        new Date(`${hoy}T12:00:00Z`).getTime()) /
        86_400_000,
    );
    return { mes: mesActual, mesTexto: nombreDelMes(mesActual), renuevaEnDias: diasParaRenovar, datos };
  }

  // Se reclama una sola vez; el bono suma al saldo pero no genera giros
  async reclamar(usuarioId: string, desafioId: string) {
    await this.perfil(usuarioId);
    const desafio = await this.prisma.desafio.findUnique({
      where: { id: desafioId },
      include: { plantilla: true },
    });
    if (!desafio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese desafío.', 404);
    const hoy = hoyEnLima();
    const mes = desafio.mes.toISOString().slice(0, 10);
    const ventana = await numeroParametro(this.prisma, 'desafio_reclamo_dias', VENTANA_RECLAMO_DIAS);
    if (mes > hoy || hoy > limiteDeReclamo(mes, ventana, desafio.reclamoExtraHoras)) {
      throw new ErrorNegocio('DESAFIO_FUERA_DE_PLAZO', 'Este desafío ya no se puede reclamar.', 409);
    }
    const avance = await progresoDesafio(this.prisma, usuarioId, desafio.plantilla, mes);
    if (avance < numero(desafio.meta)) {
      throw new ErrorNegocio('DESAFIO_INCOMPLETO', 'Aún no completas este desafío.', 409);
    }
    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioDesafio.createMany({
        data: [{ usuarioId, desafioId, progreso: avance, completadoEn: ahora }],
        skipDuplicates: true,
      });
      await tx.usuarioDesafio.updateMany({
        where: { usuarioId, desafioId, completadoEn: null },
        data: { completadoEn: ahora },
      });
      // El reclamo único se decide aquí: solo una petición encuentra la fila sin reclamar
      const reclamado = await tx.usuarioDesafio.updateMany({
        where: { usuarioId, desafioId, reclamadoEn: null },
        data: { reclamadoEn: ahora, progreso: avance },
      });
      if (reclamado.count === 0) throw new ErrorNegocio('DESAFIO_YA_RECLAMADO', 'Ya reclamaste este desafío.', 409);
      await tx.movimientoPuntos.create({
        data: {
          usuarioId,
          puntos: desafio.puntos,
          motivo: 'DESAFIO',
          cuentaParaGiros: false,
          desafioId,
          creadoEn: ahora,
        },
      });
      await tx.recicladorPerfil.update({ where: { usuarioId }, data: { puntos: { increment: desafio.puntos } } });
      if (desafio.esMetaMes) {
        await tx.giro.create({ data: { usuarioId, origen: 'META_MES', desafioId, creadoEn: ahora } });
      }
    });
    await this.progreso.evaluar(usuarioId, { ahora });
    if (desafio.esMetaMes) await this.progreso.avisarGiros(usuarioId, 1);
    return {
      puntosGanados: desafio.puntos,
      giroGanado: desafio.esMetaMes,
      desafios: await this.desafios(usuarioId),
    };
  }

  // Pantalla 36: nombre abreviado, nivel y kilos; quien se oculta no figura y no se expone ningún identificador
  async ranking(usuarioId: string, alcance: AlcanceRanking, ciudadPedida?: number) {
    const yo = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { ciudadId: true, preferencia: { select: { visibleEnRanking: true } } },
    });
    const ciudadId = ciudadPedida ?? yo.ciudadId;
    const ciudad = await this.prisma.ciudad.findFirst({
      where: { id: ciudadId, estado: 'ACTIVA' },
      select: { id: true, nombre: true },
    });
    if (!ciudad) throw new ErrorNegocio('NO_ENCONTRADO', 'Esa ciudad aún no tiene ranking.', 404);
    const maximo = await numeroParametro(this.prisma, 'ranking_max_filas', 20);
    const mes = primerDiaDelMes(hoyEnLima());
    const filas = await this.prisma.$queryRaw<Array<{ id: string; nombre: string; nivel: string; kg: number }>>`
      WITH kg AS (
        SELECT u.id, u.nombre, n.nombre AS nivel,
               CASE WHEN ${alcance} = 'acumulado' THEN p.kg_total::float8 ELSE COALESCE((
                 SELECT sum(x.kg) FROM (
                   SELECT o.kg_final AS kg FROM operacion o
                    WHERE o.reciclador_id = u.id AND o.estado = 'COMPLETADA'
                      AND o.completada_en >= (${mes}::date)::timestamp AT TIME ZONE 'America/Lima'
                   UNION ALL
                   SELECT r.kg_confirmado FROM registro_reciclaje r
                    WHERE r.reciclador_id = u.id AND r.estado = 'CONFIRMADO'
                      AND r.resuelto_en >= (${mes}::date)::timestamp AT TIME ZONE 'America/Lima'
                 ) x), 0)::float8 END AS kg
          FROM usuario u
          JOIN reciclador_perfil p ON p.usuario_id = u.id
          JOIN nivel n ON n.id = p.nivel_id
          LEFT JOIN preferencia_usuario pr ON pr.usuario_id = u.id
         WHERE u.rol = 'RECICLADOR' AND u.estado = 'ACTIVO' AND u.ciudad_id = ${ciudad.id}::int
           AND COALESCE(pr.visible_en_ranking, true)
      )
      SELECT id::text, nombre, nivel, kg FROM kg WHERE kg > 0 ORDER BY kg DESC, nombre ASC`;
    const visible = yo.preferencia?.visibleEnRanking ?? true;
    const posicionYo = filas.findIndex((f) => f.id === usuarioId);
    const lista = filas.slice(0, maximo).map((f, i) => ({
      posicion: i + 1,
      nombre: nombreCorto(f.nombre),
      nivel: f.nivel,
      kg: Math.round(f.kg * 100) / 100,
      esYo: f.id === usuarioId,
    }));
    const previo = posicionYo > 0 ? filas[posicionYo - 1] : null;
    return {
      alcance,
      ciudad: ciudad.nombre,
      mesTexto: nombreDelMes(mes),
      filas: lista,
      yo: {
        visible,
        posicion: visible && posicionYo >= 0 ? posicionYo + 1 : null,
        faltan:
          previo && posicionYo >= 0 && filas[posicionYo]
            ? Math.round((previo.kg - filas[posicionYo].kg) * 100) / 100
            : null,
        anterior: previo ? nombreCorto(previo.nombre) : null,
      },
    };
  }

  // Pantalla 14: nivel, kilos, operaciones y las insignias especiales; las reseñas salen de /yo/resenas
  async camino(usuarioId: string) {
    const perfil = await this.perfil(usuarioId);
    const [usuario, niveles, completadas] = await Promise.all([
      this.prisma.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: { nombre: true, creadoEn: true, ciudad: { select: { nombre: true } } },
      }),
      this.escalera(),
      this.prisma.operacion.findMany({
        where: { recicladorId: usuarioId, estado: 'COMPLETADA' },
        orderBy: { completadaEn: 'desc' },
        take: 4,
        select: {
          kgFinal: true,
          montoFinal: true,
          completadaEn: true,
          comprador: { select: { nombreComercial: true } },
          publicacion: { select: { material: { select: { nombre: true } } } },
        },
      }),
    ]);
    const insignias = await this.insignias(usuarioId);
    const kg = numero(perfil.kgTotal);
    const siguiente = niveles.find((n) => n.kgMin > kg) ?? null;
    const promedio = numero(perfil.califProm);
    return {
      nombre: usuario.nombre,
      ciudad: usuario.ciudad.nombre,
      desde: usuario.creadoEn,
      nivel: { numero: perfil.nivel.id, nombre: perfil.nivel.nombre },
      kgTotal: kg,
      operaciones: perfil.operacionesCompletadas,
      calificacion: calificacionPublica(promedio, perfil.califCant),
      confiable: promedio >= 4.5 && perfil.operacionesCompletadas >= 10,
      siguiente: siguiente ? { nombre: siguiente.nombre, kgMin: siguiente.kgMin } : null,
      niveles,
      especiales: insignias.datos.filter((i) => i.destacada),
      historial: completadas.map((o) => ({
        material: o.publicacion.material.nombre,
        kg: numero(o.kgFinal),
        negocio: o.comprador.nombreComercial,
        total: o.montoFinal === null ? null : numero(o.montoFinal),
        fecha: o.completadaEn,
      })),
    };
  }
}
