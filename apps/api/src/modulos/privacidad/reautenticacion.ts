import { Injectable } from '@nestjs/common';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { verificarContrasena } from '../../nucleo/seguridad/contrasenas.js';
import { Codigos } from '../auth/codigos.js';

// Las acciones sobre los propios datos se confirman otra vez: con la contraseña o, si la cuenta no tiene (entra con Google), con un código al teléfono
@Injectable()
export class Reautenticacion {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly codigos: Codigos,
  ) {}

  async tieneContrasena(usuarioId: string): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { hashContrasena: true },
    });
    return usuario.hashContrasena !== null;
  }

  // Cuentas con contraseña: se exige siempre. Sin contraseña: el paso de confirmar con código lo hace cada acción
  async exigirContrasena(usuarioId: string, contrasena: string | undefined): Promise<void> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { hashContrasena: true },
    });
    if (!usuario.hashContrasena) return;
    if (!contrasena || !(await verificarContrasena(usuario.hashContrasena, contrasena))) {
      throw new ErrorNegocio('CONTRASENA_INCORRECTA', 'La contraseña no es correcta.', 422, [
        { campo: 'contrasena', mensaje: 'No es correcta.' },
      ]);
    }
  }

  // Para quien no tiene contraseña, el código sustituye la confirmación
  async exigirCodigo(
    usuarioId: string,
    telefono: string,
    proposito: 'CONFIRMAR_ACCION' | 'ELIMINAR_CUENTA',
    codigo: string | undefined,
  ) {
    if (!codigo)
      throw new ErrorNegocio('CODIGO_REQUERIDO', 'Escribe el código que te enviamos por SMS.', 422, [
        { campo: 'codigo', mensaje: 'Escribe el código.' },
      ]);
    const dueno = await this.codigos.verificar(telefono, proposito, codigo);
    if (dueno !== usuarioId)
      throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);
  }
}
