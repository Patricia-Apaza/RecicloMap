import { Injectable, Logger } from '@nestjs/common';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import type { ResultadoCierre } from '../operaciones/cierre.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { limiteDeReclamo, progresoDesafio, VENTANA_RECLAMO_DIAS } from './desafios.js';
import { CRITERIOS, medir } from './insignias.js';
import { primerDiaDelMes, primerDiaDelMesAnterior } from './semanas.js';

export async function numeroParametro(db: ClienteBd, clave: string, defecto: number): Promise<number> {
  const fila = await db.parametro.findUnique({ where: { clave }, select: { valor: true } });
  const valor = Number(fila?.valor);
  return Number.isFinite(valor) && valor > 0 ? valor : defecto;
}

const kilos = (kg: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(kg);

export type ResultadoProgreso = { insignias: string[]; desafiosCompletados: string[] };

// Insignias, desafíos e invitaciones se evalúan tras cada hecho y al abrir las pantallas; repetir no duplica nada
@Injectable()
export class ProgresoService {
  private readonly registro = new Logger('Juego');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async asegurarDesafiosDelMes(mes: string): Promise<void> {
    const [plantillas, metaMes] = await Promise.all([
      this.prisma.plantillaDesafio.findMany({ where: { activa: true } }),
      numeroParametro(this.prisma, 'meta_mes_kg', 100),
    ]);
    if (plantillas.length === 0) return;
    await this.prisma.desafio.createMany({
      data: plantillas.map((p) => ({
        plantillaId: p.id,
        mes: new Date(`${mes}T00:00:00Z`),
        meta: p.esMetaMes ? metaMes : p.meta,
        puntos: p.puntos,
        esMetaMes: p.esMetaMes,
      })),
      skipDuplicates: true,
    });
  }

  async avisarNivel(usuarioId: string, nivel: string, kg: number): Promise<void> {
    await this.notificaciones.crear(this.prisma, {
      usuarioId,
      tipo: 'NIVEL',
      titulo: `Subiste de nivel: ${nivel}`,
      mensaje: `Llegaste a ${kilos(kg)} kg reciclados. ¡Gracias por reciclar!`,
      enlace: '/puntos/niveles',
    });
  }

  // Tras cerrar una operación: avisa el nivel y evalúa insignias y desafíos; un fallo aquí nunca deshace el cierre
  async despuesDeCompletar(cierre: Pick<ResultadoCierre, 'recicladorId' | 'nivel' | 'kgTotal'>): Promise<void> {
    try {
      if (cierre.nivel.subio) await this.avisarNivel(cierre.recicladorId, cierre.nivel.nombre, cierre.kgTotal);
      await this.evaluar(cierre.recicladorId);
    } catch (error) {
      this.registro.error(`No se pudo evaluar el progreso de ${cierre.recicladorId}: ${String(error)}`);
    }
  }

  async evaluar(usuarioId: string, opciones: { silencioso?: boolean; ahora?: Date } = {}): Promise<ResultadoProgreso> {
    const ahora = opciones.ahora ?? new Date();
    const silencioso = opciones.silencioso ?? false;
    await this.contarInvitacion(usuarioId, ahora, silencioso);

    const medidas = await medir(this.prisma, usuarioId, ahora);
    const catalogo = await this.prisma.insignia.findMany({ orderBy: { orden: 'asc' } });
    const propias = new Set(
      (await this.prisma.usuarioInsignia.findMany({ where: { usuarioId }, select: { insigniaId: true } })).map(
        (fila) => fila.insigniaId,
      ),
    );
    const nuevas: string[] = [];
    for (const insignia of catalogo) {
      const criterio = CRITERIOS[insignia.codigo];
      if (propias.has(insignia.id) || !criterio?.cumple(medidas, insignia.meta)) continue;
      const creada = await this.prisma.usuarioInsignia.createMany({
        data: [{ usuarioId, insigniaId: insignia.id, obtenidaEn: ahora }],
        skipDuplicates: true,
      });
      if (creada.count === 0) continue;
      nuevas.push(insignia.codigo);
      if (!silencioso) {
        await this.notificaciones.crear(this.prisma, {
          usuarioId,
          tipo: 'INSIGNIA',
          titulo: `Nueva insignia: ${insignia.nombre}`,
          mensaje: insignia.descripcion,
          enlace: '/puntos/insignias',
        });
      }
    }

    const completados = await this.marcarDesafios(usuarioId, ahora, silencioso);
    await this.prisma.recicladorPerfil.update({
      where: { usuarioId },
      data: { rachaSemanas: Math.min(medidas.rachaVigente, 32_000) },
    });
    return { insignias: nuevas, desafiosCompletados: completados };
  }

  // Un invitado cuenta cuando completa su primera operación; el punto va solo a quien invitó
  private async contarInvitacion(invitadoId: string, ahora: Date, silencioso: boolean): Promise<void> {
    const invitacion = await this.prisma.invitacion.findUnique({ where: { invitadoId } });
    if (!invitacion || invitacion.contadaEn) return;
    const completadas = await this.prisma.operacion.count({
      where: { recicladorId: invitadoId, estado: 'COMPLETADA' },
    });
    if (completadas === 0) return;
    const puntos = await numeroParametro(this.prisma, 'puntos_por_invitacion', 10);
    const invitador = invitacion.invitadorId;
    const aplicada = await this.prisma.$transaction(async (tx) => {
      const marcada = await tx.invitacion.updateMany({
        where: { invitadoId, contadaEn: null },
        data: { contadaEn: ahora },
      });
      if (marcada.count === 0) return false;
      await tx.movimientoPuntos.create({
        data: {
          usuarioId: invitador,
          puntos,
          motivo: 'INVITACION',
          cuentaParaGiros: false,
          invitadoId,
          creadoEn: ahora,
        },
      });
      await tx.recicladorPerfil.update({ where: { usuarioId: invitador }, data: { puntos: { increment: puntos } } });
      return true;
    });
    if (!aplicada) return;
    if (!silencioso) {
      const amigo = await this.prisma.usuario.findUnique({ where: { id: invitadoId }, select: { nombre: true } });
      await this.notificaciones.crear(this.prisma, {
        usuarioId: invitador,
        tipo: 'NIVEL',
        titulo: 'Tu amigo completó su primera operación',
        mensaje: `${amigo?.nombre.split(' ')[0] ?? 'Tu amigo'} ya recicló con RecicloMap: +${puntos} puntos para ti.`,
        enlace: '/puntos',
      });
    }
    await this.evaluar(invitador, { silencioso, ahora });
  }

  // Desafíos del mes y, hasta 7 días después de terminar, los del mes anterior
  private async marcarDesafios(usuarioId: string, ahora: Date, silencioso: boolean): Promise<string[]> {
    const hoy = hoyEnLima(ahora);
    const mesActual = primerDiaDelMes(hoy);
    await this.asegurarDesafiosDelMes(mesActual);
    const meses = [mesActual];
    const anterior = primerDiaDelMesAnterior(mesActual);
    if (hoy <= limiteDeReclamo(anterior, VENTANA_RECLAMO_DIAS)) meses.push(anterior);

    const desafios = await this.prisma.desafio.findMany({
      where: { mes: { in: meses.map((m) => new Date(`${m}T00:00:00Z`)) } },
      include: { plantilla: true, usuarios: { where: { usuarioId } } },
    });
    const completados: string[] = [];
    for (const desafio of desafios) {
      const propio = desafio.usuarios[0];
      if (propio?.completadoEn) continue;
      const progreso = await progresoDesafio(
        this.prisma,
        usuarioId,
        desafio.plantilla,
        desafio.mes.toISOString().slice(0, 10),
      );
      if (progreso < Number(desafio.meta)) continue;
      await this.prisma.usuarioDesafio.createMany({
        data: [{ usuarioId, desafioId: desafio.id }],
        skipDuplicates: true,
      });
      const marcado = await this.prisma.usuarioDesafio.updateMany({
        where: { usuarioId, desafioId: desafio.id, completadoEn: null },
        data: { completadoEn: ahora, progreso },
      });
      if (marcado.count === 0) continue;
      completados.push(desafio.plantilla.codigo);
      if (!silencioso) {
        await this.notificaciones.crear(this.prisma, {
          usuarioId,
          tipo: 'DESAFIO',
          titulo: `Desafío completado: ${desafio.plantilla.nombre}`,
          mensaje: `Reclama tus +${desafio.puntos} puntos.`,
          enlace: '/puntos/desafios',
        });
      }
    }
    return completados;
  }
}
