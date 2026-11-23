import { randomInt } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ESCALA_AZAR, type EstadoPremio, type FiltroPremios } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import { GeneradorDeAzar } from './azar.js';
import { JuegoService } from './juego.service.js';
import { numeroParametro, ProgresoService } from './progreso.service.js';
import {
  motivoSinSalida,
  type PremioDeRuleta,
  probabilidadesEfectivas,
  RuletaMalConfigurada,
  sortear,
  validarRuleta,
} from './ruleta.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigoDePremio = () => `RM-${Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')}`;
const masDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * 86_400_000);
const SIN_RULETA = () =>
  new ErrorNegocio('RULETA_NO_DISPONIBLE', 'La ruleta no está disponible por ahora. Inténtalo más tarde.', 503);

type FilaPremio = {
  id: string;
  nombre: string;
  tipo: 'PUNTOS' | 'OBJETO' | 'SIN_PREMIO';
  puntos: number | null;
  probabilidad: { toString(): string };
  stock: number | null;
  patrocinado: boolean;
  patrocinador: string | null;
  puntoEntrega: string | null;
  vigenciaCanjeDias: number | null;
  vigenteDesde: Date | null;
  vigenteHasta: Date | null;
  orden: number;
};

const aPremio = (fila: FilaPremio): PremioDeRuleta => ({
  id: fila.id,
  nombre: fila.nombre,
  tipo: fila.tipo,
  probabilidad: Number(fila.probabilidad.toString()),
  stock: fila.stock,
  vigenteDesde: fila.vigenteDesde,
  vigenteHasta: fila.vigenteHasta,
  orden: fila.orden,
});

// Giros, ruleta y premios; el resultado lo decide solo el servidor, antes de cualquier animación
@Injectable()
export class RuletaService {
  private readonly registro = new Logger('Ruleta');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly azar: GeneradorDeAzar,
    private readonly juego: JuegoService,
    private readonly progreso: ProgresoService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async recicladorActivo(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { estado: true, telefonoVerificadoEn: true, perfilReciclador: { select: { puntosReciclaje: true } } },
    });
    if (!usuario?.perfilReciclador) throw new ErrorNegocio('SIN_PERMISO', 'La ruleta es para recicladores.', 403);
    return { ...usuario, perfil: usuario.perfilReciclador };
  }

  // La administración puede pausar la ruleta: se conservan los giros y los premios ya ganados siguen reclamables
  private async estaEnPausa(db: Pick<PrismaApi, 'parametro'> = this.prisma): Promise<boolean> {
    return (
      (await db.parametro.findUnique({ where: { clave: 'ruleta_en_pausa' }, select: { valor: true } }))?.valor === '1'
    );
  }

  // Pantalla 34: giros, avance hacia el siguiente, Meta del mes y premios con sus condiciones y probabilidades reales
  async estado(usuarioId: string) {
    const usuario = await this.recicladorActivo(usuarioId);
    const enPausa = await this.estaEnPausa();
    const ahora = new Date();
    const [disponibles, puntosPorGiro, filas, desafios, ultimos] = await Promise.all([
      this.prisma.giro.count({ where: { usuarioId, usadoEn: null } }),
      numeroParametro(this.prisma, 'puntos_por_giro', 500),
      this.prisma.premio.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
      this.juego.desafios(usuarioId),
      this.prisma.sorteoRuleta.findMany({
        where: { usuarioId },
        orderBy: { creadoEn: 'desc' },
        take: 5,
        include: { premio: { select: { nombre: true, tipo: true } } },
      }),
    ]);
    const premios = filas.map(aPremio);
    let efectivas: Map<string, number>;
    try {
      efectivas = probabilidadesEfectivas(premios, ahora);
    } catch (error) {
      if (error instanceof RuletaMalConfigurada) {
        await this.alertarAdministracion(error.message);
        throw SIN_RULETA();
      }
      throw error;
    }
    const meta = desafios.datos.find((d) => d.esMetaMes && !d.delMesAnterior);
    const avance = usuario.perfil.puntosReciclaje % puntosPorGiro;
    return {
      giros: { disponibles, puntosPorGiro, avance, faltan: puntosPorGiro - avance },
      enPausa,
      puedeGirar: !enPausa && usuario.estado === 'ACTIVO' && usuario.telefonoVerificadoEn !== null,
      metaMes: meta
        ? {
            id: meta.id,
            nombre: meta.nombre,
            kg: meta.progreso,
            metaKg: meta.meta,
            puntosBono: meta.puntos,
            estado: meta.estado,
            renuevaEnDias: desafios.renuevaEnDias,
          }
        : null,
      premios: filas.map((fila) => {
        const premio = aPremio(fila);
        const motivo = motivoSinSalida(premio, ahora);
        return {
          id: fila.id,
          nombre: fila.nombre,
          tipo: fila.tipo,
          puntos: fila.puntos,
          patrocinado: fila.patrocinado,
          patrocinador: fila.patrocinador,
          puntoEntrega: fila.puntoEntrega,
          vigenciaCanjeDias: fila.vigenciaCanjeDias,
          vigenteHasta: fila.vigenteHasta,
          disponible: motivo === null,
          motivoNoDisponible: motivo,
          probabilidad: efectivas.get(fila.id) ?? 0,
        };
      }),
      ultimos: ultimos.map((s) => ({ id: s.id, nombre: s.premio.nombre, tipo: s.premio.tipo, fecha: s.creadoEn })),
    };
  }

  // Un giro consume exactamente un giro; repetir la misma clave devuelve el mismo resultado sin gastar otro
  async girar(usuarioId: string, clave: string) {
    const usuario = await this.recicladorActivo(usuarioId);
    if (usuario.estado !== 'ACTIVO' || usuario.telefonoVerificadoEn === null) {
      throw new ErrorNegocio('RULETA_REQUIERE_TELEFONO', 'Verifica tu teléfono para girar la ruleta.', 403);
    }
    const resultado = await this.sortearEnTransaccion(usuarioId, clave).catch(async (error: unknown) => {
      // Con la ruleta mal configurada nada se consumió: la transacción se deshizo y la administración se entera
      if (error instanceof ErrorNegocio && error.codigo === 'RULETA_NO_DISPONIBLE') {
        await this.alertarAdministracion(
          'Al girar, las probabilidades de la ruleta no sumaban 100 % o faltaba «Sigue intentando»',
        );
      }
      throw error;
    });

    if (!resultado.repetido) await this.despuesDeGirar(usuarioId, resultado.sorteoId);
    return { ...(await this.vistaDelSorteo(usuarioId, resultado.sorteoId)), repetido: resultado.repetido };
  }

  private sortearEnTransaccion(usuarioId: string, clave: string): Promise<{ sorteoId: string; repetido: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // Una sola solicitud por reciclador a la vez: el doble toque y las solicitudes simultáneas se ordenan aquí
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${usuarioId}, 0))`;
      const previo = await tx.sorteoRuleta.findUnique({
        where: { usuarioId_claveSolicitud: { usuarioId, claveSolicitud: clave } },
        select: { id: true },
      });
      if (previo) return { sorteoId: previo.id, repetido: true };
      if (await this.estaEnPausa(tx)) {
        throw new ErrorNegocio('RULETA_EN_PAUSA', 'La ruleta está en pausa. Conservas tus giros.', 409);
      }

      const giros = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM giro WHERE usuario_id = ${usuarioId}::uuid AND usado_en IS NULL
         ORDER BY creado_en, id LIMIT 1 FOR UPDATE`;
      const giro = giros[0];
      if (!giro) throw new ErrorNegocio('SIN_GIROS', 'No tienes giros disponibles. Gana el próximo reciclando.', 409);

      const ahora = new Date();
      const configuracion = await tx.ruletaConfiguracion.findFirst({ orderBy: { id: 'desc' } });
      const filas = await tx.premio.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
      if (!configuracion) throw SIN_RULETA();
      let premios = filas.map(aPremio);
      try {
        validarRuleta(premios);
      } catch (error) {
        if (error instanceof RuletaMalConfigurada) throw SIN_RULETA();
        throw error;
      }

      // Solo el servidor decide, y antes de mostrar nada
      const numero = this.azar.entero(ESCALA_AZAR);
      let { sorteado, entregado, motivo } = sortear(premios, numero, ahora);
      // Con stock limitado se bloquea el premio y se vuelve a mirar: el último no sale dos veces
      if (!motivo && entregado.stock !== null) {
        const [bloqueado] = await tx.$queryRaw<Array<{ stock: number | null }>>`
          SELECT stock_del_premio_bloqueado(${entregado.id}::uuid) AS stock`;
        premios = premios.map((p) => (p.id === entregado.id ? { ...p, stock: bloqueado?.stock ?? null } : p));
        ({ sorteado, entregado, motivo } = sortear(premios, numero, ahora));
      }
      const fila = filas.find((p) => p.id === entregado.id)!;
      const efectivas = probabilidadesEfectivas(premios, ahora);

      await tx.giro.update({ where: { id: giro.id }, data: { usadoEn: ahora } });
      const sorteo = await tx.sorteoRuleta.create({
        data: {
          giroId: giro.id,
          usuarioId,
          configuracionId: configuracion.id,
          numeroSorteado: numero,
          premioId: entregado.id,
          claveSolicitud: clave,
          creadoEn: ahora,
          instantanea: {
            escala: ESCALA_AZAR,
            sorteadoId: sorteado.id,
            entregadoId: entregado.id,
            reemplazo: motivo,
            premios: premios.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              tipo: p.tipo,
              probabilidad: p.probabilidad,
              efectiva: efectivas.get(p.id) ?? 0,
              stock: p.stock,
              vigenteDesde: p.vigenteDesde?.toISOString() ?? null,
              vigenteHasta: p.vigenteHasta?.toISOString() ?? null,
            })),
          },
        },
      });
      if (fila.tipo === 'PUNTOS' && fila.puntos) {
        await tx.movimientoPuntos.create({
          data: {
            usuarioId,
            puntos: fila.puntos,
            motivo: 'RULETA',
            cuentaParaGiros: false,
            sorteoId: sorteo.id,
            creadoEn: ahora,
          },
        });
        await tx.recicladorPerfil.update({ where: { usuarioId }, data: { puntos: { increment: fila.puntos } } });
      } else if (fila.tipo === 'OBJETO') {
        await tx.premioGanado.create({
          data: {
            sorteoId: sorteo.id,
            usuarioId,
            premioId: fila.id,
            codigo: codigoDePremio(),
            puntoEntrega: fila.puntoEntrega ?? '',
            venceEn: masDias(ahora, fila.vigenciaCanjeDias ?? 30),
            creadoEn: ahora,
          },
        });
      }
      return { sorteoId: sorteo.id, repetido: false };
    });
  }

  // Aviso obligatorio a la administración; no se repite mientras el anterior siga sin leer
  private async alertarAdministracion(detalle: string): Promise<void> {
    try {
      const titulo = 'La ruleta no está disponible';
      const administradores = await this.prisma.usuario.findMany({
        where: { rol: 'ADMIN', estado: 'ACTIVO' },
        select: { id: true },
      });
      for (const { id } of administradores) {
        const abierta = await this.prisma.notificacion.count({ where: { usuarioId: id, titulo, leidaEn: null } });
        if (abierta > 0) continue;
        await this.notificaciones.crear(this.prisma, {
          usuarioId: id,
          tipo: 'AVISO',
          titulo,
          mensaje: `${detalle}. Nadie pierde giros mientras tanto; corrige las probabilidades de los premios activos.`,
          obligatoria: true,
        });
      }
    } catch (error) {
      this.registro.error(`No se pudo avisar a la administración: ${String(error)}`);
    }
  }

  private async despuesDeGirar(usuarioId: string, sorteoId: string): Promise<void> {
    try {
      const sorteo = await this.prisma.sorteoRuleta.findUniqueOrThrow({
        where: { id: sorteoId },
        include: { premio: true, premioGanado: true },
      });
      if (sorteo.premio.tipo === 'PUNTOS') {
        await this.notificaciones.crear(this.prisma, {
          usuarioId,
          tipo: 'GIRO',
          titulo: `Ganaste ${sorteo.premio.nombre}`,
          mensaje: 'Se sumaron a tu saldo como puntos de bono.',
          enlace: '/puntos/premios',
        });
      } else if (sorteo.premio.tipo === 'OBJETO' && sorteo.premioGanado) {
        await this.notificaciones.crear(this.prisma, {
          usuarioId,
          tipo: 'GIRO',
          titulo: `Ganaste: ${sorteo.premio.nombre}`,
          mensaje: 'Reclámalo en Mis premios antes de que venza el plazo.',
          enlace: '/puntos/premios',
        });
      }
      await this.progreso.evaluar(usuarioId);
    } catch (error) {
      this.registro.error(`No se pudo completar el aviso del sorteo ${sorteoId}: ${String(error)}`);
    }
  }

  private async vistaDelSorteo(usuarioId: string, sorteoId: string) {
    const [sorteo, disponibles, perfil] = await Promise.all([
      this.prisma.sorteoRuleta.findUniqueOrThrow({
        where: { id: sorteoId },
        include: { premio: true, premioGanado: true },
      }),
      this.prisma.giro.count({ where: { usuarioId, usadoEn: null } }),
      this.prisma.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId }, select: { puntos: true } }),
    ]);
    const ganado = sorteo.premioGanado;
    return {
      id: sorteo.id,
      fecha: sorteo.creadoEn,
      premio: {
        id: sorteo.premio.id,
        nombre: sorteo.premio.nombre,
        tipo: sorteo.premio.tipo,
        puntos: sorteo.premio.puntos,
        patrocinado: sorteo.premio.patrocinado,
        patrocinador: sorteo.premio.patrocinador,
      },
      premioGanado: ganado ? { id: ganado.id, estado: ganado.estado, venceEn: ganado.venceEn } : null,
      girosRestantes: disponibles,
      puntos: perfil.puntos,
    };
  }

  // Pantalla 35: premios con objeto y puntos de la ruleta, con filtro y resumen
  async misPremios(usuarioId: string, filtro: FiltroPremios) {
    await this.recicladorActivo(usuarioId);
    await this.vencerPremios(usuarioId);
    const sorteos = await this.prisma.sorteoRuleta.findMany({
      where: { usuarioId, premio: { tipo: { in: ['PUNTOS', 'OBJETO'] } } },
      orderBy: { creadoEn: 'desc' },
      include: { premio: true, premioGanado: true },
    });
    const items = sorteos.map((s) => {
      const ganado = s.premioGanado;
      const estado: EstadoPremio = ganado ? ganado.estado : 'ACREDITADO';
      return {
        id: ganado?.id ?? s.id,
        tipo: s.premio.tipo as 'PUNTOS' | 'OBJETO',
        nombre: s.premio.nombre,
        puntos: s.premio.puntos,
        patrocinado: s.premio.patrocinado,
        patrocinador: s.premio.patrocinador,
        estado,
        // El código aparece al reclamar; antes no se muestra
        codigo: ganado && (ganado.estado === 'RECLAMADO' || ganado.estado === 'ENTREGADO') ? ganado.codigo : null,
        puntoEntrega: ganado?.puntoEntrega ?? null,
        venceEn: ganado && ganado.estado === 'POR_RECLAMAR' ? ganado.venceEn : null,
        ganadoEn: s.creadoEn,
        entregadoEn: ganado?.entregadoEn ?? null,
      };
    });
    const resumen = {
      ganados: items.length,
      porReclamar: items.filter((i) => i.estado === 'POR_RECLAMAR').length,
      reclamados: items.filter((i) => i.estado === 'RECLAMADO').length,
      entregados: items.filter((i) => i.estado === 'ENTREGADO').length,
      puntosGanados: items.filter((i) => i.tipo === 'PUNTOS').reduce((suma, i) => suma + (i.puntos ?? 0), 0),
    };
    const coincide = (estado: EstadoPremio) =>
      filtro === 'todos' ||
      (filtro === 'por-reclamar' && estado === 'POR_RECLAMAR') ||
      (filtro === 'reclamados' && estado === 'RECLAMADO') ||
      (filtro === 'entregados' && estado === 'ENTREGADO') ||
      (filtro === 'puntos' && estado === 'ACREDITADO');
    const conteos: Record<FiltroPremios, number> = {
      todos: items.length,
      'por-reclamar': resumen.porReclamar,
      reclamados: resumen.reclamados,
      entregados: resumen.entregados,
      puntos: items.filter((i) => i.estado === 'ACREDITADO').length,
    };
    return { resumen, conteos, items: items.filter((i) => coincide(i.estado)) };
  }

  // El reciclador pide el reclamo; la base rechaza el cambio si el plazo ya terminó
  async reclamar(usuarioId: string, premioGanadoId: string) {
    await this.recicladorActivo(usuarioId);
    const premio = await this.prisma.premioGanado.findFirst({ where: { id: premioGanadoId, usuarioId } });
    if (!premio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese premio.', 404);
    if (premio.estado === 'RECLAMADO' || premio.estado === 'ENTREGADO') {
      throw new ErrorNegocio('PREMIO_YA_RECLAMADO', 'Ya reclamaste este premio.', 409);
    }
    if (premio.estado === 'VENCIDO' || premio.venceEn <= new Date()) {
      await this.vencerPremios(usuarioId);
      throw new ErrorNegocio('PREMIO_VENCIDO', 'El plazo para reclamar este premio terminó.', 409);
    }
    const cambio = await this.prisma.premioGanado.updateMany({
      where: { id: premioGanadoId, usuarioId, estado: 'POR_RECLAMAR' },
      data: { estado: 'RECLAMADO' },
    });
    if (cambio.count === 0) throw new ErrorNegocio('PREMIO_YA_RECLAMADO', 'Ya reclamaste este premio.', 409);
    const reclamado = await this.prisma.premioGanado.findUniqueOrThrow({
      where: { id: premioGanadoId },
      include: { premio: { select: { nombre: true } } },
    });
    return {
      id: reclamado.id,
      nombre: reclamado.premio.nombre,
      estado: reclamado.estado,
      codigo: reclamado.codigo,
      puntoEntrega: reclamado.puntoEntrega,
      reclamadoEn: reclamado.reclamadoEn,
    };
  }

  // Renunciar: la persona deja el premio por su cuenta. No devuelve stock y queda en el registro de privacidad
  async renunciar(usuarioId: string, premioGanadoId: string) {
    await this.recicladorActivo(usuarioId);
    const premio = await this.prisma.premioGanado.findFirst({
      where: { id: premioGanadoId, usuarioId },
      select: { estado: true, premio: { select: { nombre: true } } },
    });
    if (!premio) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese premio.', 404);
    if (premio.estado !== 'POR_RECLAMAR' && premio.estado !== 'RECLAMADO') {
      throw new ErrorNegocio('PREMIO_NO_RENUNCIABLE', 'Este premio ya no se puede renunciar.', 409);
    }
    await this.prisma.$transaction(async (tx) => {
      const cambio = await tx.premioGanado.updateMany({
        where: { id: premioGanadoId, usuarioId, estado: { in: ['POR_RECLAMAR', 'RECLAMADO'] } },
        data: { estado: 'RENUNCIADO' },
      });
      if (cambio.count === 0)
        throw new ErrorNegocio('PREMIO_NO_RENUNCIABLE', 'Este premio ya no se puede renunciar.', 409);
      await tx.registroPrivacidad.create({ data: { usuarioId, tipo: 'PREMIO_RENUNCIADO' } });
    });
    return { id: premioGanadoId, nombre: premio.premio.nombre, estado: 'RENUNCIADO' as const };
  }

  // Un premio no reclamado a tiempo queda VENCIDO; la base solo lo admite pasado el plazo
  async vencerPremios(usuarioId?: string): Promise<number> {
    const resultado = await this.prisma.premioGanado.updateMany({
      where: { estado: 'POR_RECLAMAR', venceEn: { lte: new Date() }, ...(usuarioId ? { usuarioId } : {}) },
      data: { estado: 'VENCIDO' },
    });
    return resultado.count;
  }

  // Avisa una sola vez de los premios que están por vencer
  async avisarPorVencer(): Promise<number> {
    const ahora = new Date();
    const dias = await numeroParametro(this.prisma, 'premio_aviso_dias', 3);
    const pendientes = await this.prisma.premioGanado.findMany({
      where: { estado: 'POR_RECLAMAR', avisoVenceEn: null, venceEn: { gt: ahora, lte: masDias(ahora, dias) } },
      include: { premio: { select: { nombre: true } } },
    });
    for (const p of pendientes) {
      const marcado = await this.prisma.premioGanado.updateMany({
        where: { id: p.id, avisoVenceEn: null },
        data: { avisoVenceEn: ahora },
      });
      if (marcado.count === 0) continue;
      await this.notificaciones.crear(this.prisma, {
        usuarioId: p.usuarioId,
        tipo: 'GIRO',
        titulo: `Tu premio está por vencer: ${p.premio.nombre}`,
        mensaje: 'Reclámalo en Mis premios antes de que termine el plazo.',
        enlace: '/puntos/premios',
      });
    }
    return pendientes.length;
  }

  @Cron('*/10 * * * *', { name: 'premios-vencidos', timeZone: 'America/Lima' })
  async tareaDePremios(): Promise<void> {
    if (enMantenimiento()) return;
    try {
      await this.vencerPremios();
      await this.avisarPorVencer();
    } catch (error) {
      this.registro.error(`No se pudo revisar el plazo de los premios: ${String(error)}`);
    }
  }
}
