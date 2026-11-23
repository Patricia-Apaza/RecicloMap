'use client';

import { useEffect, useRef, useState } from 'react';
import { ErrorApi, pedir, type PasoPendiente, type Sesion } from '@/sesion/api';
import { AvisoAcceso } from './marco-acceso';
import { useContinuar } from './continuar';

const ID_CLIENTE = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT = 'https://accounts.google.com/gsi/client';

type Google = {
  accounts: {
    id: {
      initialize: (opciones: {
        client_id: string;
        callback: (respuesta: { credential: string }) => void;
        ux_mode?: string;
      }) => void;
      renderButton: (elemento: HTMLElement, opciones: Record<string, string | number>) => void;
    };
  };
};

function cargarGoogle(): Promise<Google> {
  const ventana = window as unknown as { google?: Google };
  if (ventana.google) return Promise.resolve(ventana.google);
  return new Promise((resolver, rechazar) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const script =
      existente ?? Object.assign(document.createElement('script'), { src: SCRIPT, async: true, defer: true });
    script.addEventListener('load', () =>
      ventana.google ? resolver(ventana.google) : rechazar(new Error('sin google')),
    );
    script.addEventListener('error', () => rechazar(new Error('sin google')));
    if (!existente) document.head.appendChild(script);
  });
}

// Sin la credencial del equipo el botón no aparece; en desarrollo se avisa por qué
export function BotonGoogle({ texto = 'continue_with' }: { texto?: 'continue_with' | 'signup_with' }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const continuar = useContinuar();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ID_CLIENTE) return;
    let vigente = true;
    cargarGoogle()
      .then((google) => {
        if (!vigente || !contenedor.current) return;
        google.accounts.id.initialize({
          client_id: ID_CLIENTE,
          callback: ({ credential }) => {
            setError(null);
            pedir<Sesion | PasoPendiente>('/auth/google', { cuerpo: { credencial: credential } })
              .then((respuesta) => continuar(respuesta))
              .catch((causa: unknown) =>
                setError(causa instanceof ErrorApi ? causa.message : 'No pudimos entrar con Google.'),
              );
          },
        });
        google.accounts.id.renderButton(contenedor.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: texto,
          shape: 'rectangular',
          locale: 'es-419',
          width: Math.min(400, contenedor.current.clientWidth || 320),
        });
      })
      .catch(() => {
        if (vigente) setError('No pudimos cargar el inicio con Google. Revisa tu conexión.');
      });
    return () => {
      vigente = false;
    };
  }, [continuar, texto]);

  if (!ID_CLIENTE) {
    return process.env.NODE_ENV === 'production' ? null : (
      <AvisoAcceso tono="warn">
        Aviso interno: el botón de Google está oculto porque falta NEXT_PUBLIC_GOOGLE_CLIENT_ID en el archivo .env.
      </AvisoAcceso>
    );
  }
  return (
    <>
      <div className="ac-separador">o</div>
      <div ref={contenedor} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
      {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
    </>
  );
}
