'use client';

import { VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BarraAcceso, MarcoAcceso } from '@/acceso/marco-acceso';
import { useAviso } from '@/diseno/avisos';
import { Casilla } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { rutaDelPaso } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

const LADO = {
  antetitulo: 'Textos actualizados',
  titulo: 'Cambiamos las reglas,',
  resaltado: 'tú decides.',
  texto: 'Para seguir usando RecicloMap necesitamos que leas y aceptes la versión vigente de los textos legales.',
  chips: [
    { icono: 'i-shield' as const, texto: 'Qué datos guardamos' },
    { icono: 'i-lock' as const, texto: 'Quién los ve' },
  ],
};

function Contenido() {
  const router = useRouter();
  const aviso = useAviso();
  const { actualizar, cerrar } = useSesion();
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aceptar = async () => {
    if (!acepta) {
      setError('Debes aceptar para continuar.');
      return;
    }
    setEnviando(true);
    try {
      await pedir('/yo/consentimientos', { cuerpo: { version: VERSION_TEXTOS_LEGALES, aceptaTerminos: true } });
      const perfil = await actualizar();
      router.replace(perfil ? rutaDelPaso(perfil) : RUTAS.bienvenida);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tu aceptación.');
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso lado={LADO}>
      <BarraAcceso volver={RUTAS.bienvenida} etiquetaVolver="Volver al inicio" />
      <h1 className="ac-titulo">Textos legales actualizados</h1>
      <p className="ac-sub">
        Cambió la versión de los Términos de uso y de la Política de privacidad (versión {VERSION_TEXTOS_LEGALES}).
        Léelos y acéptalos para seguir.
      </p>
      <p>
        <Link className="ac-enlace" style={{ display: 'inline' }} href={RUTAS.terminos} target="_blank">
          Leer los Términos y la Política de privacidad
        </Link>
      </p>
      <div className={error ? 'field err' : 'field'}>
        <Casilla
          marcado={acepta}
          alCambiar={(v) => {
            setAcepta(v);
            setError(null);
          }}
          etiqueta="Acepto los términos de uso y la política de privacidad."
        />
        {error && (
          <span className="msg" role="alert">
            <Icono nombre="i-alert" tamano="sm" />
            {error}
          </span>
        )}
      </div>
      <button type="button" className="btn p bloque" disabled={enviando} onClick={() => void aceptar()}>
        Aceptar y continuar
      </button>
      <button
        type="button"
        className="btn ghost bloque"
        onClick={() => void cerrar().then(() => router.replace(RUTAS.bienvenida))}
      >
        No acepto, cerrar sesión
      </button>
    </MarcoAcceso>
  );
}

export function AceptarTextos() {
  return (
    <Protegida pasos={['ACEPTAR_TEXTOS']}>
      <Contenido />
    </Protegida>
  );
}
