import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Rol, UsuarioEstado } from '../../generado/prisma/enums.js';

export const ES_PUBLICA = 'rm:publica';
export const ROLES_PERMITIDOS = 'rm:roles';
export const ESTADOS_PERMITIDOS = 'rm:estados';
export const REQUIERE_NEGOCIO_VERIFICADO = 'rm:negocio-verificado';
export const SIN_TEXTOS_VIGENTES = 'rm:sin-textos-vigentes';

export type UsuarioSesion = {
  id: string;
  rol: Rol;
  estado: UsuarioEstado;
  sesionId: string;
  compradorId?: string;
  negocioVerificado: boolean;
  textosPendientes: boolean;
};

export type SolicitudConUsuario = { usuario?: UsuarioSesion };

// Sin sesión; si llega una válida, igual se identifica al usuario
export const Publica = () => SetMetadata(ES_PUBLICA, true);

export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_PERMITIDOS, roles);

// Por defecto se exige cuenta activa (o suspendida, solo para leer)
export const PermiteEstados = (...estados: UsuarioEstado[]) => SetMetadata(ESTADOS_PERMITIDOS, estados);

// RN-18: solo negocios aprobados por el administrador
export const NegocioVerificado = () => SetMetadata(REQUIERE_NEGOCIO_VERIFICADO, true);

// Rutas que se pueden usar aunque falte aceptar los textos legales vigentes (para poder aceptarlos o salir)
export const SinTextosVigentes = () => SetMetadata(SIN_TEXTOS_VIGENTES, true);

export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UsuarioSesion => {
  const usuario = contexto.switchToHttp().getRequest<SolicitudConUsuario>().usuario;
  if (!usuario) throw new Error('UsuarioActual se usó en una ruta pública');
  return usuario;
});

// En rutas públicas: la persona con sesión, si la hay (para no contar sus propias visitas, por ejemplo)
export const UsuarioOpcional = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioSesion | undefined => {
    return contexto.switchToHttp().getRequest<SolicitudConUsuario>().usuario;
  },
);
