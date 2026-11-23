'use client';

import Link from '@/diseno/enlace';
import { useState } from 'react';
import { Icono } from '@/diseno/icono';
import { RUTAS } from './rutas';

export function FranjaInvitado() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="gbar" role="region" aria-label="Aviso para invitados">
      <Icono nombre="i-info" />
      <span>
        <b>Estás viendo como invitado.</b> Puedes mirar el mapa y los precios. Para guardar favoritos o publicar,{' '}
        <Link href={RUTAS.registroReciclador}>crea tu cuenta</Link>.
      </span>
      <button type="button" aria-label="Cerrar aviso" onClick={() => setVisible(false)}>
        <Icono nombre="i-close" />
      </button>
    </div>
  );
}
