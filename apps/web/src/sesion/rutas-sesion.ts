import type { RolNavegacion } from '@/navegacion/menus';
import { RUTAS } from '@/navegacion/rutas';
import type { ResumenUsuario, RolCuenta } from './api';

export const ROL_NAVEGACION: Record<RolCuenta, RolNavegacion> = {
  RECICLADOR: 'reciclador',
  CENTRO: 'centro',
  COMPRADOR_MOVIL: 'comprador',
  ADMIN: 'admin',
};

export const TEXTO_ROL: Record<RolCuenta, string> = {
  RECICLADOR: 'Reciclador',
  CENTRO: 'Centro de acopio',
  COMPRADOR_MOVIL: 'Comprador móvil',
  ADMIN: 'Administrador',
};

// Pantalla de inicio de cada rol cuando ya no le falta ningún paso
export const INICIO_ROL: Record<RolCuenta, string> = {
  RECICLADOR: RUTAS.mapa,
  CENTRO: RUTAS.centroResumen,
  COMPRADOR_MOVIL: RUTAS.compradorInicio,
  ADMIN: RUTAS.adminVerificaciones,
};

// A dónde llevar a una cuenta según lo que le falta; la API decide el paso
export function rutaDelPaso(usuario: Pick<ResumenUsuario, 'rol' | 'siguientePaso'>): string {
  switch (usuario.siguientePaso) {
    case 'VERIFICAR_TELEFONO':
      return RUTAS.verificarTelefono;
    case 'ELEGIR_MATERIALES':
      return RUTAS.registroMateriales;
    case 'COMPLETAR_NEGOCIO':
      return usuario.rol === 'COMPRADOR_MOVIL' ? RUTAS.registroComprador : RUTAS.registroCentro;
    case 'ESPERAR_VERIFICACION':
      return RUTAS.verificacion;
    case 'COMPLETAR_CUENTA_GOOGLE':
      return RUTAS.completarCuenta;
    default:
      return INICIO_ROL[usuario.rol];
  }
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return (
    ((partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '')).toUpperCase() || 'RM'
  );
}

// "Marco Quispe Condori" → "Marco Q."
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return nombre.trim();
  return `${partes[0]} ${partes[1]![0]!.toUpperCase()}.`;
}

// Solo rutas internas para volver después de iniciar sesión
export function rutaSegura(destino: string | null | undefined): string | null {
  if (!destino || !destino.startsWith('/') || destino.startsWith('//')) return null;
  return destino;
}
