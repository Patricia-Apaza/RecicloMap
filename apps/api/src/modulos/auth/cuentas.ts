import { randomBytes } from 'node:crypto';
import { type SiguientePaso, VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';
import type { Rol, UsuarioEstado } from '../../generado/prisma/enums.js';
import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

export type ResumenUsuario = {
  id: string;
  nombre: string;
  rol: Rol;
  estado: UsuarioEstado;
  siguientePaso: SiguientePaso;
};

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function nuevoCodigoInvitacion(): string {
  const bytes = randomBytes(6);
  return `RECI-${Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('')}`;
}

export function enmascararTelefono(telefono: string): string {
  return `••• ••• ${telefono.slice(-3)}`;
}

export async function ciudadActiva(cliente: ClienteBd): Promise<number> {
  const ciudad = await cliente.ciudad.findFirst({
    where: { estado: 'ACTIVA' },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (!ciudad) throw new ErrorNegocio('SIN_CIUDAD_ACTIVA', 'No hay una ciudad activa para registrarse.', 503);
  return ciudad.id;
}

// Qué le falta a la cuenta para usar la app; la web decide a qué pantalla llevar
export async function resumenUsuario(cliente: ClienteBd, usuarioId: string): Promise<ResumenUsuario> {
  const usuario = await cliente.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    select: {
      id: true,
      nombre: true,
      rol: true,
      estado: true,
      _count: { select: { materiales: true } },
      comprador: { select: { estadoVerificacion: true } },
    },
  });
  const textosVigentes = await cliente.consentimiento.count({
    where: { usuarioId, tipo: { in: ['TERMINOS', 'PRIVACIDAD'] }, version: VERSION_TEXTOS_LEGALES },
  });
  let siguientePaso: SiguientePaso = 'LISTO';
  if (usuario.estado === 'EN_ELIMINACION') siguientePaso = 'CANCELAR_ELIMINACION';
  else if (textosVigentes < 2 && usuario.estado !== 'PENDIENTE_TELEFONO') siguientePaso = 'ACEPTAR_TEXTOS';
  else if (usuario.estado === 'PENDIENTE_TELEFONO') siguientePaso = 'VERIFICAR_TELEFONO';
  else if (usuario.rol === 'RECICLADOR' && usuario._count.materiales === 0) siguientePaso = 'ELEGIR_MATERIALES';
  else if (usuario.rol === 'CENTRO' || usuario.rol === 'COMPRADOR_MOVIL') {
    if (!usuario.comprador) siguientePaso = 'COMPLETAR_NEGOCIO';
    else if (usuario.comprador.estadoVerificacion !== 'APROBADO') siguientePaso = 'ESPERAR_VERIFICACION';
  }
  return { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, estado: usuario.estado, siguientePaso };
}

export function errorDuplicado(campo: 'telefono' | 'correo'): ErrorNegocio {
  return campo === 'telefono'
    ? new ErrorNegocio(
        'TELEFONO_REGISTRADO',
        'Este teléfono ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
        409,
        [{ campo: 'telefono', mensaje: 'Este teléfono ya tiene una cuenta.' }],
      )
    : new ErrorNegocio('CORREO_REGISTRADO', 'Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.', 409, [
        { campo: 'correo', mensaje: 'Este correo ya tiene una cuenta.' },
      ]);
}

export async function comprobarDisponibles(cliente: ClienteBd, telefono: string, correo?: string): Promise<void> {
  const existentes = await cliente.usuario.findMany({
    where: { OR: [{ telefono }, ...(correo ? [{ correo }] : [])] },
    select: { telefono: true, correo: true },
  });
  if (existentes.some((usuario) => usuario.telefono === telefono)) throw errorDuplicado('telefono');
  if (correo && existentes.some((usuario) => usuario.correo === correo)) throw errorDuplicado('correo');
}

export function consentimientosIniciales() {
  return {
    create: [
      { tipo: 'TERMINOS' as const, version: VERSION_TEXTOS_LEGALES },
      { tipo: 'PRIVACIDAD' as const, version: VERSION_TEXTOS_LEGALES },
      { tipo: 'MAYOR_EDAD' as const, version: VERSION_TEXTOS_LEGALES },
    ],
  };
}
