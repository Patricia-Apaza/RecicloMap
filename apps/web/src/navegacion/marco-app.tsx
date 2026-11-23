'use client';

import Link from '@/diseno/enlace';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { type AvisoEnVivo, EVENTO_AVISO, useAvisosEnVivo } from '@/notificaciones/en-vivo';
import { pedir } from '@/sesion/api';
import { iniciales, nombreCorto, ROL_NAVEGACION, TEXTO_ROL } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';
import { BarraNavegacion } from './barra-navegacion';
import { FranjaInvitado } from './franja-invitado';
import { tieneCampana } from './menus';
import { RUTAS } from './rutas';

// Contador de la campana; con cada aviso en vivo se actualiza, se muestra y se avisa a la pantalla abierta
function useSinLeer(activo: boolean, persona: string | null): number {
  const aviso = useAviso();
  const [sinLeer, setSinLeer] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    pedir<{ sinLeer: number }>('/notificaciones/contador')
      .then((respuesta) => vigente && setSinLeer(respuesta.sinLeer))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [activo, version]);
  const alLlegar = useCallback(
    (nuevo: AvisoEnVivo) => {
      aviso(nuevo.titulo);
      setVersion((v) => v + 1);
      window.dispatchEvent(new CustomEvent<AvisoEnVivo>(EVENTO_AVISO, { detail: nuevo }));
    },
    [aviso],
  );
  const alVolver = useCallback(() => {
    setVersion((v) => v + 1);
    window.dispatchEvent(new Event(EVENTO_AVISO));
  }, []);
  useAvisosEnVivo(activo ? persona : null, alLlegar, alVolver);
  return activo ? sinLeer : 0;
}

// Marco de las pantallas de la app: barra por rol, franja del invitado y pie
// Con pantallaCompleta (mapa 09) el contenido ocupa todo el alto, sin márgenes ni pie
export function MarcoApp({
  activa,
  pantallaCompleta = false,
  children,
}: {
  activa?: string;
  pantallaCompleta?: boolean;
  children: ReactNode;
}) {
  const { usuario } = useSesion();
  const rol = usuario ? ROL_NAVEGACION[usuario.rol] : 'invitado';
  const sinLeer = useSinLeer(Boolean(usuario) && tieneCampana(rol), usuario?.id ?? null);
  return (
    <>
      <BarraNavegacion
        rol={rol}
        activa={activa}
        sinLeer={sinLeer}
        usuario={
          usuario
            ? {
                nombre: nombreCorto(usuario.nombre),
                iniciales: iniciales(usuario.nombre),
                rolTexto: TEXTO_ROL[usuario.rol],
              }
            : undefined
        }
      />
      {!usuario && <FranjaInvitado />}
      {pantallaCompleta ? (
        children
      ) : (
        <>
          <main className="page" id="main">
            {children}
          </main>
          <footer className="foot">
            <span>© RecicloMap · Juliaca, Puno · Sin pagos ni GPS en tiempo real</span>
            <nav aria-label="Pie de página">
              {usuario && <Link href={RUTAS.configuracion}>Configuración</Link>}
              <Link href={RUTAS.terminos}>Términos y privacidad</Link>
            </nav>
          </footer>
        </>
      )}
    </>
  );
}
