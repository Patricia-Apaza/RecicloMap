import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BLOQUEOS_ELIMINACION,
  type BloqueoEliminacion,
  ELIMINACION_GRACIA_DIAS,
  TEXTO_BLOQUEO,
} from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { Sesiones } from '../../nucleo/seguridad/sesiones.js';
import { EfectosSuspensionService } from '../administracion/efectos-suspension.service.js';
import { Codigos } from '../auth/codigos.js';
import { Almacen } from '../fotos/almacen.js';
import { Reautenticacion } from './reautenticacion.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

const DIA_MS = 86_400_000;

@Injectable()
export class EliminacionService {
  private readonly registro = new Logger('Privacidad');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly reautenticacion: Reautenticacion,
    private readonly codigos: Codigos,
    private readonly sesiones: Sesiones,
    private readonly efectos: EfectosSuspensionService,
    private readonly almacen: Almacen,
  ) {}

  async bloqueos(usuarioId: string) {
    const filas = await this.prisma.$queryRaw<Array<{ tipo: BloqueoEliminacion; cantidad: number }>>`
      SELECT tipo, cantidad FROM cuenta_bloqueos(${usuarioId}::uuid)`;
    return BLOQUEOS_ELIMINACION.map((tipo) => ({
      tipo,
      cantidad: filas.find((f) => f.tipo === tipo)?.cantidad ?? 0,
      ...TEXTO_BLOQUEO[tipo],
    })).filter((b) => b.cantidad > 0);
  }

  async estado(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { estado: true, rol: true, eliminacionProgramadaEn: true },
    });
    return {
      enEliminacion: usuario.estado === 'EN_ELIMINACION',
      programadaEn: usuario.eliminacionProgramadaEn,
      graciaDias: ELIMINACION_GRACIA_DIAS,
      puedeEliminar: usuario.rol !== 'ADMIN',
      bloqueos: usuario.estado === 'EN_ELIMINACION' ? [] : await this.bloqueos(usuarioId),
    };
  }

  private async exigirPosible(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { rol: true, estado: true, telefono: true },
    });
    if (usuario.rol === 'ADMIN') {
      throw new ErrorNegocio(
        'ADMIN_NO_ELIMINABLE',
        'Las cuentas de administración no se eliminan desde la aplicación.',
        403,
      );
    }
    if (usuario.estado !== 'ACTIVO') {
      throw new ErrorNegocio('CUENTA_NO_ACTIVA', 'Solo una cuenta activa puede pedir su eliminación.', 409);
    }
    const bloqueos = await this.bloqueos(usuarioId);
    if (bloqueos.length > 0) {
      throw new ErrorNegocio(
        'ELIMINACION_BLOQUEADA',
        'Antes de eliminar tu cuenta resuelve lo que sigue pendiente.',
        409,
        bloqueos.map((b) => ({ campo: b.tipo, mensaje: `${b.titulo} (${b.cantidad}). ${b.que}` })),
      );
    }
    return usuario;
  }

  async pedirCodigo(usuarioId: string, contrasena: string | undefined) {
    await this.reautenticacion.exigirContrasena(usuarioId, contrasena);
    const usuario = await this.exigirPosible(usuarioId);
    return this.codigos.enviar({ destino: usuario.telefono, proposito: 'ELIMINAR_CUENTA', canal: 'sms', usuarioId });
  }

  async solicitar(usuarioId: string, contrasena: string | undefined, codigo: string, ahora = new Date()) {
    await this.reautenticacion.exigirContrasena(usuarioId, contrasena);
    const usuario = await this.exigirPosible(usuarioId);
    const dueno = await this.codigos.verificar(usuario.telefono, 'ELIMINAR_CUENTA', codigo);
    if (dueno !== usuarioId)
      throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);

    const programadaEn = new Date(ahora.getTime() + ELIMINACION_GRACIA_DIAS * DIA_MS);
    await this.prisma.$transaction(async (tx) => {
      const marcada = await tx.usuario.updateMany({
        where: { id: usuarioId, estado: 'ACTIVO' },
        data: { estado: 'EN_ELIMINACION', eliminacionSolicitadaEn: ahora, eliminacionProgramadaEn: programadaEn },
      });
      if (marcada.count === 0)
        throw new ErrorNegocio('CUENTA_NO_ACTIVA', 'Solo una cuenta activa puede pedir su eliminación.', 409);
      await tx.suscripcionPush.deleteMany({ where: { usuarioId } });
      await tx.registroPrivacidad.create({ data: { usuarioId, tipo: 'ELIMINACION_SOLICITADA' } });
    });
    await this.efectos.aplicar(usuarioId);
    await this.sesiones.revocarTodas(usuarioId);
    return { programadaEn };
  }

  async cancelar(usuarioId: string) {
    const hecho = await this.prisma.$transaction(async (tx) => {
      const r = await tx.usuario.updateMany({
        where: { id: usuarioId, estado: 'EN_ELIMINACION', eliminacionProgramadaEn: { gt: new Date() } },
        data: { estado: 'ACTIVO', eliminacionSolicitadaEn: null, eliminacionProgramadaEn: null },
      });
      if (r.count > 0) await tx.registroPrivacidad.create({ data: { usuarioId, tipo: 'ELIMINACION_CANCELADA' } });
      return r.count > 0;
    });
    if (!hecho) throw new ErrorNegocio('SIN_ELIMINACION', 'Tu cuenta no tiene una eliminación que cancelar.', 409);
    return { estado: 'ACTIVO' as const };
  }

  // Pasado el plazo de gracia la anonimización es irreversible; si algo impide hacerla, la cuenta espera
  @Cron('*/30 * * * *', { name: 'privacidad-anonimizar', timeZone: 'America/Lima' })
  async barrer(): Promise<void> {
    if (enMantenimiento()) return;
    try {
      const anonimizadas = await this.anonimizarVencidas();
      const borrados = await this.vaciarArchivosPorBorrar();
      if (anonimizadas + borrados > 0)
        this.registro.log(`${anonimizadas} cuentas anonimizadas, ${borrados} archivos borrados.`);
    } catch (error) {
      this.registro.error(`No se pudo depurar cuentas: ${String(error)}`);
    }
  }

  async anonimizarVencidas(ahora = new Date()): Promise<number> {
    const vencidas = await this.prisma.usuario.findMany({
      where: { estado: 'EN_ELIMINACION', eliminacionProgramadaEn: { lte: ahora } },
      select: { id: true },
    });
    let hechas = 0;
    for (const { id } of vencidas) {
      try {
        await this.prisma.$executeRaw`SELECT anonimizar_cuenta(${id}::uuid, ${ahora}::timestamptz)`;
        hechas += 1;
      } catch (error) {
        this.registro.warn(`La cuenta ${id} no se pudo anonimizar todavía: ${String(error)}`);
      }
    }
    return hechas;
  }

  // El almacén se vacía después de que la base ya rompió el vínculo; lo que falle se reintenta en la siguiente vuelta
  async vaciarArchivosPorBorrar(): Promise<number> {
    const pendientes = await this.prisma.archivoPorBorrar.findMany({ take: 200, orderBy: { creadoEn: 'asc' } });
    let borrados = 0;
    for (const p of pendientes) {
      try {
        await this.almacen.borrar(p.clave);
        if (p.claveMiniatura) await this.almacen.borrar(p.claveMiniatura);
        await this.prisma.archivoPorBorrar.delete({ where: { id: p.id } });
        borrados += 1;
      } catch (error) {
        this.registro.warn(`No se pudo borrar ${p.clave} del almacén: ${String(error)}`);
      }
    }
    return borrados;
  }
}
