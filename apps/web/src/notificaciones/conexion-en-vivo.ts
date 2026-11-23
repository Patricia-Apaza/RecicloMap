'use client';

import { io, type Socket } from 'socket.io-client';
import { tokenActual } from '@/sesion/api';
import type { AvisoEnVivo } from './en-vivo';

type Oyente = { alLlegar: (aviso: AvisoEnVivo) => void; alVolver?: () => void };

// Una sola conexión de avisos para toda la app: cambiar de pantalla no la cierra ni la vuelve a abrir (cada apertura son varias
// solicitudes). Se cierra con la pestaña oculta o poco después de que ninguna pantalla la use, y si cambia la persona
const oyentes = new Set<Oyente>();
let conexion: Socket | null = null;
let propietario: string | null = null;
let ultimaPersona: string | null = null;
let cierre: ReturnType<typeof setTimeout> | null = null;
let escuchandoVisibilidad = false;
const GRACIA_MS = 4000;

function abrir(persona: string): void {
  propietario = persona;
  conexion = io({
    path: '/api/v1/en-vivo',
    addTrailingSlash: false,
    transports: ['polling'],
    auth: (responder) => responder({ token: tokenActual() }),
  });
  conexion.on('notificacion', (aviso: AvisoEnVivo) => {
    for (const oyente of oyentes) oyente.alLlegar(aviso);
  });
}

function cerrar(): void {
  conexion?.disconnect();
  conexion = null;
  propietario = null;
}

function alCambiarVisibilidad(): void {
  if (document.hidden) {
    cerrar();
    return;
  }
  if (!conexion && oyentes.size > 0 && ultimaPersona) {
    abrir(ultimaPersona);
    for (const oyente of oyentes) oyente.alVolver?.();
  }
}

export function suscribirAvisos(persona: string, oyente: Oyente): () => void {
  if (cierre) clearTimeout(cierre);
  cierre = null;
  oyentes.add(oyente);
  ultimaPersona = persona;
  if (!escuchandoVisibilidad) {
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    escuchandoVisibilidad = true;
  }
  if (conexion && propietario !== persona) cerrar();
  if (!conexion && !document.hidden) abrir(persona);
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0) {
      cierre = setTimeout(() => {
        if (oyentes.size === 0) {
          cerrar();
          ultimaPersona = null;
        }
      }, GRACIA_MS);
    }
  };
}
