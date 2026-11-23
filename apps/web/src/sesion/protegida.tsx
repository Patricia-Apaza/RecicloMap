'use client';

import type { SiguientePaso } from '@reciclomap/shared';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import type { ResumenUsuario, RolCuenta } from './api';
import { rutaDelPaso, rutaSegura } from './rutas-sesion';
import { useSesion } from './sesion';

type Decision = { tipo: 'esperar' } | { tipo: 'mostrar' } | { tipo: 'ir'; ruta: string };

export function decidirAcceso(
  estado: { cargando: boolean; usuario: ResumenUsuario | null; invitado: boolean },
  reglas: { roles?: RolCuenta[]; pasos?: SiguientePaso[]; invitado?: boolean },
  rutaActual: string,
): Decision {
  if (estado.cargando) return { tipo: 'esperar' };
  const { usuario } = estado;
  if (!usuario) {
    if (reglas.invitado && estado.invitado) return { tipo: 'mostrar' };
    return { tipo: 'ir', ruta: `/ingresar?volver=${encodeURIComponent(rutaActual)}` };
  }
  const pasos = reglas.pasos ?? ['LISTO'];
  if ((reglas.roles && !reglas.roles.includes(usuario.rol)) || !pasos.includes(usuario.siguientePaso)) {
    const destino = rutaDelPaso(usuario);
    return destino === rutaActual ? { tipo: 'mostrar' } : { tipo: 'ir', ruta: destino };
  }
  return { tipo: 'mostrar' };
}

export function PantallaCargando() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <span className="girando" aria-hidden="true" />
      <span className="sr-only">Cargando</span>
    </div>
  );
}

// Muestra la pantalla solo a quien corresponde; a los demás los lleva a su paso pendiente
export function Protegida({
  roles,
  pasos,
  invitado,
  children,
}: {
  roles?: RolCuenta[];
  pasos?: SiguientePaso[];
  invitado?: boolean;
  children: ReactNode;
}) {
  const sesion = useSesion();
  const router = useRouter();
  const rutaActual = usePathname();
  const decision = decidirAcceso(sesion, { roles, pasos, invitado }, rutaActual);

  useEffect(() => {
    if (decision.tipo === 'ir') router.replace(decision.ruta);
  }, [decision, router]);

  return decision.tipo === 'mostrar' ? children : <PantallaCargando />;
}

// Pantallas de entrada: quien ya tiene sesión va directo a su paso pendiente
export function SoloSinSesion({ children }: { children: ReactNode }) {
  const { cargando, usuario } = useSesion();
  const router = useRouter();
  useEffect(() => {
    if (cargando || !usuario) return;
    const volver = rutaSegura(new URLSearchParams(window.location.search).get('volver'));
    router.replace(usuario.siguientePaso === 'LISTO' && volver ? volver : rutaDelPaso(usuario));
  }, [cargando, usuario, router]);
  return cargando || usuario ? <PantallaCargando /> : children;
}
