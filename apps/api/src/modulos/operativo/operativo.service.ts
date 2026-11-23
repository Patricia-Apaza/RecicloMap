import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import type { EstadoOperativo, RolDeRegistro } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { enMantenimiento, fijarMantenimiento } from './modo-mantenimiento.js';

type Control = {
  bannerTexto: string | null;
  bannerDesde: Date | null;
  bannerHasta: Date | null;
  bannerVersion: number;
  registroRecicladorAbierto: boolean;
  registroNegocioAbierto: boolean;
  mantenimientoActivo: boolean;
  mantenimientoMensaje: string | null;
  mantenimientoDesde: Date | null;
};

// Lo que la administración controla en caliente: aviso global, registro abierto o cerrado y modo mantenimiento
@Injectable()
export class OperativoService implements OnModuleInit {
  private readonly registro = new Logger('Operativo');
  private cache: Control | null = null;

  constructor(
    private readonly prisma: PrismaApi,
    private readonly configuracion: Configuracion,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refrescar();
  }

  // El estado se relee cada pocos segundos y al instante cuando la administración cambia algo
  @Interval(5000)
  async refrescar(): Promise<void> {
    try {
      this.cache = await this.prisma.controlOperativo.findUniqueOrThrow({ where: { id: 1 } });
      fijarMantenimiento(this.cache.mantenimientoActivo);
    } catch (error) {
      this.registro.warn(`No se pudo leer el estado operativo: ${String(error)}`);
    }
  }

  async actual(): Promise<Control> {
    if (!this.cache) await this.refrescar();
    return this.cache!;
  }

  async estadoPublico(ahora = new Date()): Promise<EstadoOperativo> {
    const c = await this.actual();
    const bannerVigente =
      c.bannerTexto && c.bannerDesde && c.bannerHasta && c.bannerDesde <= ahora && ahora < c.bannerHasta;
    return {
      ahora: ahora.toISOString(),
      demostracion: this.configuracion.demostracion,
      banner: bannerVigente
        ? { id: c.bannerVersion, texto: c.bannerTexto!, hasta: c.bannerHasta!.toISOString() }
        : null,
      registro: { reciclador: c.registroRecicladorAbierto, negocio: c.registroNegocioAbierto },
      mantenimiento: {
        activo: c.mantenimientoActivo,
        mensaje: c.mantenimientoActivo ? c.mantenimientoMensaje : null,
        desde: c.mantenimientoActivo ? (c.mantenimientoDesde?.toISOString() ?? null) : null,
      },
    };
  }

  // Cerrado: mensaje claro y las cuentas existentes no se tocan
  async exigirRegistroAbierto(rol: RolDeRegistro): Promise<void> {
    const c = await this.actual();
    const abierto = rol === 'reciclador' ? c.registroRecicladorAbierto : c.registroNegocioAbierto;
    if (!abierto) {
      throw new ErrorNegocio(
        'REGISTRO_CERRADO',
        rol === 'reciclador'
          ? 'Por ahora no estamos recibiendo registros de recicladores. Vuelve a intentarlo más adelante; si ya tienes cuenta, inicia sesión.'
          : 'Por ahora no estamos recibiendo registros de negocios. Vuelve a intentarlo más adelante; si ya tienes cuenta, inicia sesión.',
        403,
      );
    }
  }

  async registroCerradoPara(ambos: boolean): Promise<boolean> {
    const c = await this.actual();
    return ambos
      ? !c.registroRecicladorAbierto && !c.registroNegocioAbierto
      : !c.registroRecicladorAbierto || !c.registroNegocioAbierto;
  }

  async mensajeMantenimiento(): Promise<string> {
    return (
      (await this.actual()).mantenimientoMensaje ??
      'RecicloMap está en mantenimiento. Solo puedes consultar; vuelve en un momento.'
    );
  }

  // Al terminar un mantenimiento, cada plazo vigente se corre lo que este duró: nadie pierde un plazo, un premio ni un reclamo
  @Cron('* * * * *', { name: 'mantenimiento-devolver-plazos' })
  async devolverPlazos(): Promise<number> {
    if (enMantenimiento()) return 0;
    try {
      const n =
        (await this.prisma.$queryRaw<Array<{ n: number }>>`SELECT extender_plazos_mantenimiento() AS n`)[0]?.n ?? 0;
      if (n > 0) this.registro.log(`Se devolvió el tiempo de ${n} mantenimiento(s) a los plazos vigentes.`);
      return n;
    } catch (error) {
      this.registro.error(`No se pudieron devolver los plazos: ${String(error)}`);
      return 0;
    }
  }
}
