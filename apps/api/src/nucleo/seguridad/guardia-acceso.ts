import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';
import type { Rol, UsuarioEstado } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../base-datos/prisma.js';
import { ErrorNegocio } from '../errores/error-negocio.js';
import {
  ES_PUBLICA,
  ESTADOS_PERMITIDOS,
  REQUIERE_NEGOCIO_VERIFICADO,
  ROLES_PERMITIDOS,
  SIN_TEXTOS_VIGENTES,
  type SolicitudConUsuario,
  type UsuarioSesion,
} from './decoradores.js';
import { Tokens } from './tokens.js';

const ESTADOS_POR_DEFECTO: UsuarioEstado[] = ['ACTIVO', 'SUSPENDIDO'];
const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

const MENSAJE_ESTADO: Partial<Record<UsuarioEstado, { codigo: string; mensaje: string }>> = {
  PENDIENTE_TELEFONO: { codigo: 'TELEFONO_SIN_VERIFICAR', mensaje: 'Primero verifica tu teléfono.' },
  REGISTRO_INCOMPLETO: { codigo: 'REGISTRO_INCOMPLETO', mensaje: 'Primero completa el registro de tu negocio.' },
  EN_ELIMINACION: {
    codigo: 'CUENTA_EN_ELIMINACION',
    mensaje: 'Tu cuenta está en proceso de eliminación. Puedes cancelarla durante el período de gracia.',
  },
  ACTIVO: { codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para hacer esto.' },
};

// Toda ruta exige sesión salvo que se marque como pública: lo permitido se enumera, no se supone
@Injectable()
export class GuardiaAcceso implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: Tokens,
    private readonly prisma: PrismaApi,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    const publica = this.reflector.getAllAndOverride<boolean>(ES_PUBLICA, objetivos) ?? false;
    const solicitud = contexto.switchToHttp().getRequest<Request & SolicitudConUsuario>();
    const token = extraerToken(solicitud);

    if (!token) {
      if (publica) return true;
      throw new ErrorNegocio('NO_AUTENTICADO', 'Inicia sesión para continuar.', 401);
    }

    let usuario: UsuarioSesion;
    try {
      usuario = await this.cargarUsuario(token);
    } catch (error) {
      if (publica) return true;
      throw error;
    }
    solicitud.usuario = usuario;
    if (publica) return true;

    const estados =
      this.reflector.getAllAndOverride<UsuarioEstado[]>(ESTADOS_PERMITIDOS, objetivos) ?? ESTADOS_POR_DEFECTO;
    const sinTextosRuta = this.reflector.getAllAndOverride<boolean>(SIN_TEXTOS_VIGENTES, objetivos) ?? false;
    if (usuario.estado === 'SUSPENDIDO' && !METODOS_DE_LECTURA.has(solicitud.method) && !sinTextosRuta) {
      throw new ErrorNegocio(
        'CUENTA_SUSPENDIDA',
        'Tu cuenta está suspendida. Solo puedes consultar tu información.',
        403,
      );
    }
    if (!estados.includes(usuario.estado)) {
      const detalle = MENSAJE_ESTADO[usuario.estado] ?? MENSAJE_ESTADO.ACTIVO!;
      throw new ErrorNegocio(detalle.codigo, detalle.mensaje, 403);
    }

    const sinTextos = this.reflector.getAllAndOverride<boolean>(SIN_TEXTOS_VIGENTES, objetivos) ?? false;
    if (usuario.textosPendientes && !sinTextos) {
      throw new ErrorNegocio(
        'TEXTOS_PENDIENTES',
        'Cambiaron los Términos o la Política de privacidad. Acéptalos para seguir.',
        403,
      );
    }

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES_PERMITIDOS, objetivos);
    if (roles && !roles.includes(usuario.rol)) {
      throw new ErrorNegocio('SIN_PERMISO', 'No tienes permiso para hacer esto.', 403);
    }

    const exigeVerificado = this.reflector.getAllAndOverride<boolean>(REQUIERE_NEGOCIO_VERIFICADO, objetivos) ?? false;
    if (exigeVerificado && !usuario.negocioVerificado) {
      throw new ErrorNegocio(
        'NEGOCIO_NO_VERIFICADO',
        'Tu negocio todavía no está verificado. Podrás hacerlo cuando un administrador lo apruebe.',
        403,
      );
    }
    return true;
  }

  // El estado se lee de la base en cada solicitud: una suspensión o un cierre de sesión rigen al instante
  // También lo usa la conexión en vivo de notificaciones, que no pasa por esta guardia
  async cargarUsuario(token: string): Promise<UsuarioSesion> {
    const { usuarioId, sesionId } = await this.tokens.verificarAcceso(token);
    const [usuario, sesion, textosVigentes] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, rol: true, estado: true, comprador: { select: { id: true, estadoVerificacion: true } } },
      }),
      this.prisma.sesion.findUnique({ where: { id: sesionId }, select: { usuarioId: true, revocadaEn: true } }),
      this.prisma.consentimiento.count({
        where: { usuarioId, tipo: { in: ['TERMINOS', 'PRIVACIDAD'] }, version: VERSION_TEXTOS_LEGALES },
      }),
    ]);
    if (!usuario || usuario.estado === 'ELIMINADO' || !sesion || sesion.revocadaEn || sesion.usuarioId !== usuarioId) {
      throw new ErrorNegocio('NO_AUTENTICADO', 'Inicia sesión para continuar.', 401);
    }
    return {
      id: usuario.id,
      rol: usuario.rol,
      estado: usuario.estado,
      sesionId,
      compradorId: usuario.comprador?.id,
      negocioVerificado: usuario.comprador?.estadoVerificacion === 'APROBADO',
      textosPendientes: textosVigentes < 2,
    };
  }
}

function extraerToken(solicitud: Request): string | undefined {
  const cabecera = solicitud.headers.authorization;
  if (!cabecera?.startsWith('Bearer ')) return undefined;
  return cabecera.slice('Bearer '.length).trim() || undefined;
}
