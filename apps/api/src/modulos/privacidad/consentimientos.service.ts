import { Injectable } from '@nestjs/common';
import { VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { resumenUsuario } from '../auth/cuentas.js';

@Injectable()
export class ConsentimientosService {
  constructor(private readonly prisma: PrismaApi) {}

  async estado(usuarioId: string) {
    const filas = await this.prisma.consentimiento.findMany({
      where: { usuarioId },
      orderBy: { aceptadoEn: 'desc' },
      select: { tipo: true, version: true, aceptadoEn: true },
    });
    const vigentes = filas.filter((f) => f.version === VERSION_TEXTOS_LEGALES);
    const tiene = (tipo: string) => vigentes.some((f) => f.tipo === tipo);
    return {
      versionVigente: VERSION_TEXTOS_LEGALES,
      pendientes: (['TERMINOS', 'PRIVACIDAD'] as const).filter((t) => !tiene(t)),
      aceptados: filas.map((f) => ({ tipo: f.tipo, version: f.version, aceptadoEn: f.aceptadoEn })),
    };
  }

  // Aceptar de nuevo deja un registro nuevo con su versión y fecha; los anteriores no se tocan
  async aceptar(usuarioId: string) {
    await this.prisma.$transaction([
      this.prisma.consentimiento.createMany({
        data: (['TERMINOS', 'PRIVACIDAD'] as const).map((tipo) => ({
          usuarioId,
          tipo,
          version: VERSION_TEXTOS_LEGALES,
        })),
        skipDuplicates: true,
      }),
      this.prisma.registroPrivacidad.create({ data: { usuarioId, tipo: 'CONSENTIMIENTO_ACEPTADO' } }),
    ]);
    return {
      ...(await this.estado(usuarioId)),
      siguientePaso: (await resumenUsuario(this.prisma, usuarioId)).siguientePaso,
    };
  }
}
