'use client';

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { pedir, tokenActual } from '@/sesion/api';

export type AvisoEnVivo = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  creadaEn: string;
};

export const EVENTO_AVISO = 'reciclomap:aviso';

// Las pantallas con datos vivos (bandeja, seguimiento, compras) se recargan cuando llega un aviso
export function useAlLlegarAviso(recargar: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO_AVISO, recargar);
    return () => window.removeEventListener(EVENTO_AVISO, recargar);
  }, [recargar]);
}

// El proxy de la web reenvía HTTP, no WebSocket: se usa sondeo largo, que funciona con el mismo origen y la cookie
export function useAvisosEnVivo(activo: boolean, alLlegar: (aviso: AvisoEnVivo) => void): void {
  const manejador = useRef(alLlegar);
  useEffect(() => {
    manejador.current = alLlegar;
  }, [alLlegar]);
  useEffect(() => {
    if (!activo) return;
    const conexion = io({
      path: '/api/v1/en-vivo',
      transports: ['polling'],
      auth: (responder) => responder({ token: tokenActual() }),
    });
    conexion.on('notificacion', (aviso: AvisoEnVivo) => manejador.current(aviso));
    return () => {
      conexion.disconnect();
    };
  }, [activo]);
}

const aBytes = (base64: string) => {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
};

export const pushDisponible = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!pushDisponible()) return null;
  const registro = await navigator.serviceWorker.getRegistration('/');
  return (await registro?.pushManager.getSubscription()) ?? null;
}

// Pide permiso al navegador y registra la suscripción en la API; sin clave configurada no hay push
export async function activarPush(clavePublica: string): Promise<'activado' | 'denegado' | 'no-disponible'> {
  if (!pushDisponible()) return 'no-disponible';
  if ((await Notification.requestPermission()) !== 'granted') return 'denegado';
  const registro =
    (await navigator.serviceWorker.getRegistration('/')) ??
    (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clavePublica) }));
  await pedir('/notificaciones/push', { cuerpo: suscripcion.toJSON() });
  return 'activado';
}

export async function desactivarPush(): Promise<void> {
  const suscripcion = await suscripcionActual();
  if (!suscripcion) return;
  await pedir('/notificaciones/push', { metodo: 'DELETE', cuerpo: { endpoint: suscripcion.endpoint } });
  await suscripcion.unsubscribe();
}
