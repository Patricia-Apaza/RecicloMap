'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { RUTAS } from '@/navegacion/rutas';
import { esSesion, type PasoPendiente, type Sesion } from '@/sesion/api';
import { rutaDelPaso, rutaSegura } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

const CLAVE_PENDIENTE = 'rm_verificar';
const CLAVE_GOOGLE = 'rm_google';

export type VerificacionPendiente = { telefono?: string; enmascarado?: string; enviadoEn: number; reenviarEn: number };
export type CuentaGoogle = { tokenTemporal: string; nombre?: string; correo?: string };

function leer<T>(clave: string): T | null {
  try {
    const texto = sessionStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    sessionStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento la pantalla siguiente pedirá el dato otra vez
  }
}

export const leerPendiente = () => leer<VerificacionPendiente>(CLAVE_PENDIENTE);
export const guardarPendiente = (pendiente: VerificacionPendiente) => guardar(CLAVE_PENDIENTE, pendiente);
export const leerCuentaGoogle = () => leer<CuentaGoogle>(CLAVE_GOOGLE);

export function olvidarPendientes(): void {
  try {
    sessionStorage.removeItem(CLAVE_PENDIENTE);
    sessionStorage.removeItem(CLAVE_GOOGLE);
  } catch {
    // Nada que limpiar
  }
}

// Decide la pantalla siguiente según lo que respondió la API
export function useContinuar() {
  const { abrir } = useSesion();
  const router = useRouter();

  return useCallback(
    (respuesta: Sesion | PasoPendiente, contexto: { telefono?: string } = {}) => {
      if (esSesion(respuesta)) {
        olvidarPendientes();
        abrir(respuesta);
        const volver = rutaSegura(new URLSearchParams(window.location.search).get('volver'));
        const destino = respuesta.usuario.siguientePaso === 'LISTO' && volver ? volver : rutaDelPaso(respuesta.usuario);
        router.replace(destino);
        return;
      }
      if (respuesta.siguientePaso === 'VERIFICAR_TELEFONO') {
        guardarPendiente({
          telefono: contexto.telefono,
          enmascarado: respuesta.telefono,
          enviadoEn: Date.now(),
          reenviarEn: respuesta.reenviarEn ?? 60,
        });
        router.push(RUTAS.verificarTelefono);
        return;
      }
      if (respuesta.siguientePaso === 'COMPLETAR_CUENTA_GOOGLE' && respuesta.tokenTemporal) {
        guardar(CLAVE_GOOGLE, {
          tokenTemporal: respuesta.tokenTemporal,
          nombre: respuesta.nombre,
          correo: respuesta.correo,
        });
        router.push(RUTAS.completarCuenta);
      }
    },
    [abrir, router],
  );
}
