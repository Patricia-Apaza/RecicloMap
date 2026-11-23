'use client';

import { useState } from 'react';
import { leerPendiente, useContinuar, type VerificacionPendiente } from '@/acceso/continuar';
import { tomarFotoPendiente } from '@/acceso/foto-pendiente';
import { subirFoto } from '@/acceso/fotos';
import { BarraAcceso, MarcoAcceso } from '@/acceso/marco-acceso';
import { FormularioVerificacion } from '@/acceso/verificar-telefono';
import { useAviso } from '@/diseno/avisos';
import { RUTAS } from '@/navegacion/rutas';
import type { Sesion } from '@/sesion/api';
import { PantallaCargando, SoloSinSesion } from '@/sesion/protegida';

const LADO = {
  antetitulo: 'Verificación del teléfono',
  titulo: 'Tu número,',
  resaltado: 'tu llave.',
  texto: 'Con tu teléfono verificado, quien acepte tu oferta podrá escribirte. Nadie más lo ve.',
  chips: [
    { icono: 'i-lock' as const, texto: 'Código de un solo uso' },
    { icono: 'i-clock' as const, texto: 'Vence en 10 minutos' },
  ],
};

export function VerificacionTelefono() {
  const continuar = useContinuar();
  const aviso = useAviso();
  // Solo se muestra en el navegador: el formulario espera a que cargue la sesión
  const [pendiente] = useState<VerificacionPendiente | null | undefined>(() =>
    typeof window === 'undefined' ? undefined : leerPendiente(),
  );

  const alVerificar = (sesion: Sesion) => {
    const foto = tomarFotoPendiente();
    continuar(sesion);
    if (foto) {
      void subirFoto(foto, 'PERFIL').catch(() => aviso('No pudimos subir tu foto. Podrás agregarla desde tu perfil.'));
    }
  };

  return (
    <SoloSinSesion>
      <MarcoAcceso lado={LADO}>
        <BarraAcceso volver={RUTAS.iniciarSesion} etiquetaVolver="Volver al inicio de sesión" />
        {pendiente === undefined ? (
          <PantallaCargando />
        ) : (
          <FormularioVerificacion
            telefono={pendiente?.telefono}
            enmascarado={pendiente?.enmascarado}
            enviadoEn={pendiente?.enviadoEn}
            reenviarEn={pendiente?.reenviarEn}
            codigoDePrueba={pendiente?.codigoDePrueba}
            alVerificar={alVerificar}
          />
        )}
      </MarcoAcceso>
    </SoloSinSesion>
  );
}
