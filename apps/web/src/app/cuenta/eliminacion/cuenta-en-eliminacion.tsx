'use client';

import { formatearFecha } from '@reciclomap/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useResumenPrivacidad } from '@/cuenta/privacidad-cuenta';
import { BarraAcceso, MarcoAcceso } from '@/acceso/marco-acceso';
import { useAviso } from '@/diseno/avisos';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { rutaDelPaso } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

const LADO = {
  antetitulo: 'Cuenta inactiva',
  titulo: 'Aún puedes',
  resaltado: 'quedarte.',
  texto:
    'Tu cuenta no aparece en el mapa ni puede operar. Si te arrepientes, cancela la eliminación antes de que venza el plazo.',
  chips: [
    { icono: 'i-clock' as const, texto: 'Plazo de gracia de 7 días' },
    { icono: 'i-shield' as const, texto: 'Después no hay vuelta atrás' },
  ],
};

function Contenido() {
  const router = useRouter();
  const aviso = useAviso();
  const { actualizar, cerrar } = useSesion();
  const resumen = useResumenPrivacidad();
  const [enviando, setEnviando] = useState(false);
  const programada = resumen?.eliminacion.programadaEn;

  const cancelar = async () => {
    setEnviando(true);
    try {
      await pedir('/yo/eliminacion', { metodo: 'DELETE' });
      const perfil = await actualizar();
      aviso('Cancelamos la eliminación. Tu cuenta vuelve a estar activa.');
      router.replace(perfil ? rutaDelPaso(perfil) : RUTAS.bienvenida);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos cancelar la eliminación.');
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso lado={LADO}>
      <BarraAcceso volver={RUTAS.bienvenida} etiquetaVolver="Volver al inicio" />
      <h1 className="ac-titulo">Tu cuenta está en proceso de eliminación</h1>
      <p className="ac-sub" data-eliminacion>
        {programada
          ? `Se anonimizará de forma definitiva el ${formatearFecha(programada)}. Hasta entonces puedes cancelarla.`
          : 'Se anonimizará de forma definitiva al terminar el plazo de gracia.'}
      </p>
      <button type="button" className="btn p bloque" disabled={enviando} onClick={() => void cancelar()}>
        Cancelar la eliminación y quedarme
      </button>
      <button
        type="button"
        className="btn ghost bloque"
        onClick={() => void cerrar().then(() => router.replace(RUTAS.bienvenida))}
      >
        Cerrar sesión y seguir con la eliminación
      </button>
    </MarcoAcceso>
  );
}

export function CuentaEnEliminacion() {
  return (
    <Protegida pasos={['CANCELAR_ELIMINACION']}>
      <Contenido />
    </Protegida>
  );
}
