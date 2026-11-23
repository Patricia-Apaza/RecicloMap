'use client';

import Link from '@/diseno/enlace';
import { Ventana } from '@/diseno/avisos';
import { RUTAS } from './rutas';

// Lo que un invitado puede abrir; el resto pide crear una cuenta
export const PESTANAS_INVITADO = new Set(['mapa', 'calc']);

export const MOTIVO_INVITADO: Record<string, string> = {
  pub: 'Para publicar tu material necesitas una cuenta. Es gratis y toma un minuto.',
  ofe: 'Para recibir y aceptar ofertas necesitas una cuenta. Es gratis y toma un minuto.',
  pun: 'Para ganar puntos, insignias y giros de la ruleta necesitas una cuenta.',
  his: 'Para ver el historial de tus operaciones necesitas una cuenta.',
  fav: 'Para guardar tus favoritos necesitas una cuenta. Es gratis y toma un minuto.',
};

export function InvitacionRegistro({ motivo, alCerrar }: { motivo: string | null; alCerrar: () => void }) {
  return (
    <Ventana abierta={motivo !== null} alCerrar={alCerrar} antetitulo="SOLO UN PASO" titulo="Crea tu cuenta gratis">
      <p>{motivo}</p>
      <Link className="btn p" href={RUTAS.registroReciclador}>
        Crear cuenta de reciclador
      </Link>
      <Link className="btn" href={RUTAS.iniciarSesion}>
        Ya tengo cuenta
      </Link>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Seguir mirando como invitado
      </button>
    </Ventana>
  );
}
