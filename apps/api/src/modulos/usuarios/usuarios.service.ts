import { Injectable } from '@nestjs/common';
import type { CodigoMaterial } from '@reciclomap/shared';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { Codigos, type CodigoEnviado } from '../auth/codigos.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { resumenUsuario } from '../auth/cuentas.js';
import { NotificacionesService } from '../notificaciones/notificaciones.service.js';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly notificaciones: NotificacionesService,
    private readonly codigos: Codigos,
  ) {}

  async perfil(usuarioId: string) {
    const [resumen, datos] = await Promise.all([
      resumenUsuario(this.prisma, usuarioId),
      this.prisma.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: {
          telefono: true,
          correo: true,
          correoVerificadoEn: true,
          fotoId: true,
          perfilReciclador: { select: { zonaId: true, sobreMi: true, zona: { select: { nombre: true } } } },
          preferencia: { select: { visibleEnRanking: true } },
          ciudad: { select: { id: true, nombre: true } },
          materiales: { select: { material: { select: { codigo: true, nombre: true } } } },
          insignias: { select: { insignia: { select: { codigo: true, nombre: true } }, obtenidaEn: true } },
        },
      }),
    ]);
    return {
      ...resumen,
      telefono: datos.telefono,
      correo: datos.correo,
      correoVerificado: datos.correoVerificadoEn !== null,
      fotoId: datos.fotoId,
      zona: datos.perfilReciclador?.zonaId
        ? { id: datos.perfilReciclador.zonaId, nombre: datos.perfilReciclador.zona?.nombre ?? '' }
        : null,
      sobreMi: datos.perfilReciclador?.sobreMi ?? null,
      visibleEnRanking: datos.preferencia?.visibleEnRanking ?? true,
      ciudad: datos.ciudad,
      materiales: datos.materiales.map((fila) => fila.material),
      insignias: datos.insignias.map((fila) => ({ ...fila.insignia, obtenidaEn: fila.obtenidaEn })),
    };
  }

  // Completa el registro con los materiales que recicla; Semilla ya se entregó al verificar el teléfono
  async guardarMateriales(usuarioId: string, codigos: CodigoMaterial[]) {
    await this.prisma.$transaction(async (tx) => {
      const materiales = await tx.material.findMany({ where: { codigo: { in: codigos } }, select: { id: true } });
      await tx.recicladorMaterial.deleteMany({ where: { usuarioId } });
      await tx.recicladorMaterial.createMany({
        data: materiales.map((material) => ({ usuarioId, materialId: material.id })),
      });
    });
    return this.perfil(usuarioId);
  }

  // Pantalla 22: nombre, correo, zona y "sobre ti". La zona debe ser de su ciudad
  async editarPerfil(
    usuarioId: string,
    datos: { nombre: string; correo?: string | null; zonaId: number; sobreMi?: string | null },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const cuenta = await tx.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
        select: { ciudadId: true, correo: true },
      });
      const zona = await tx.zona.findFirst({
        where: { id: datos.zonaId, ciudadId: cuenta.ciudadId },
        select: { id: true },
      });
      if (!zona) throw new ErrorNegocio('ZONA_NO_VALIDA', 'Elige una zona de tu ciudad.', 422);
      await this.cambiarCorreo(tx, usuarioId, cuenta.correo, datos.correo);
      await tx.usuario.update({ where: { id: usuarioId }, data: { nombre: datos.nombre } });
      await tx.recicladorPerfil.update({
        where: { usuarioId },
        data: { zonaId: datos.zonaId, sobreMi: datos.sobreMi || null },
      });
    });
    return this.perfil(usuarioId);
  }

  async editarCorreo(usuarioId: string, correo: string | null) {
    await this.prisma.$transaction(async (tx) => {
      const cuenta = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { correo: true } });
      await this.cambiarCorreo(tx, usuarioId, cuenta.correo, correo);
    });
    return this.perfil(usuarioId);
  }

  // Cambiar el teléfono exige verificar el número nuevo con un código por SMS
  async pedirCambioTelefono(usuarioId: string, telefono: string): Promise<CodigoEnviado> {
    const actual = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { telefono: true },
    });
    if (actual.telefono === telefono) throw new ErrorNegocio('MISMO_TELEFONO', 'Ese ya es tu número.', 422);
    if (await this.prisma.usuario.count({ where: { telefono } })) {
      throw new ErrorNegocio('TELEFONO_EN_USO', 'Ese número ya está registrado en otra cuenta.', 409);
    }
    return this.codigos.enviar({ destino: telefono, proposito: 'CAMBIAR_TELEFONO', canal: 'sms', usuarioId });
  }

  async confirmarCambioTelefono(usuarioId: string, telefono: string, codigo: string) {
    const dueno = await this.codigos.verificar(telefono, 'CAMBIAR_TELEFONO', codigo);
    if (dueno !== usuarioId)
      throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id: usuarioId }, data: { telefono, telefonoVerificadoEn: new Date() } });
        // Aviso de seguridad: no se apaga con las preferencias
        await this.notificaciones.crear(tx, {
          usuarioId,
          tipo: 'AVISO',
          titulo: 'Cambiaste tu número',
          mensaje: `Tu cuenta ahora usa el número ${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}. Si no fuiste tú, escríbenos.`,
          obligatoria: true,
        });
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new ErrorNegocio('TELEFONO_EN_USO', 'Ese número ya está registrado en otra cuenta.', 409);
      }
      throw error;
    }
    return this.perfil(usuarioId);
  }

  async cambiarPreferencias(usuarioId: string, cambio: { visibleEnRanking?: boolean }) {
    await this.prisma.preferenciaUsuario.upsert({
      where: { usuarioId },
      create: { usuarioId, ...cambio },
      update: cambio,
    });
    return this.perfil(usuarioId);
  }

  // Lista de espera de una ciudad "Próximamente" (pantalla 39)
  async listaEspera(usuarioId: string, ciudadId: number) {
    const ciudad = await this.prisma.ciudad.findUnique({
      where: { id: ciudadId },
      select: { estado: true, nombre: true },
    });
    if (!ciudad) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa ciudad.', 404);
    if (ciudad.estado === 'ACTIVA')
      throw new ErrorNegocio('CIUDAD_ACTIVA', `RecicloMap ya funciona en ${ciudad.nombre}.`, 409);
    await this.prisma.listaEsperaCiudad.upsert({
      where: { ciudadId_usuarioId: { ciudadId, usuarioId } },
      create: { ciudadId, usuarioId },
      update: {},
    });
    return { ciudad: ciudad.nombre, enListaDeEspera: true };
  }

  private async cambiarCorreo(
    tx: ClienteBd,
    usuarioId: string,
    anterior: string | null,
    nuevo: string | null | undefined,
  ) {
    if (nuevo === undefined || nuevo === anterior) return;
    if (nuevo && (await tx.usuario.count({ where: { correo: nuevo, id: { not: usuarioId } } }))) {
      throw new ErrorNegocio('CORREO_EN_USO', 'Ese correo ya está registrado en otra cuenta.', 409);
    }
    // Un correo nuevo queda sin verificar
    await tx.usuario.update({ where: { id: usuarioId }, data: { correo: nuevo, correoVerificadoEn: null } });
  }
}
