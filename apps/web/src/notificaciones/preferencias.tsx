'use client';

import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { Interruptor } from '@/diseno/formulario';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { ErrorApi, pedir } from '@/sesion/api';
import { activarPush, desactivarPush, pushDisponible, suscripcionActual } from './en-vivo';

type Preferencias = { ofertas: boolean; operaciones: true; premios: boolean; avisos: boolean };

// Preferencias por grupo: los avisos de una operación propia y los de seguridad de la cuenta no se apagan
export function PanelPreferencias() {
  const aviso = useAviso();
  const { configuracion } = useConfiguracionPublica();
  const [preferencias, setPreferencias] = useState<Preferencias | null>(null);
  const [push, setPush] = useState(false);

  useEffect(() => {
    let vigente = true;
    pedir<Preferencias>('/notificaciones/preferencias')
      .then((respuesta) => vigente && setPreferencias(respuesta))
      .catch(() => undefined);
    suscripcionActual()
      .then((suscripcion) => vigente && setPush(suscripcion !== null))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const cambiar = async (grupo: 'ofertas' | 'premios' | 'avisos', valor: boolean) => {
    try {
      setPreferencias(
        await pedir<Preferencias>('/notificaciones/preferencias', { metodo: 'PUT', cuerpo: { [grupo]: valor } }),
      );
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tu preferencia.');
    }
  };

  const cambiarPush = async (valor: boolean) => {
    const clave = configuracion?.push?.clavePublica;
    try {
      if (!valor) {
        await desactivarPush();
        setPush(false);
        return;
      }
      if (!clave) return;
      const resultado = await activarPush(clave);
      setPush(resultado === 'activado');
      if (resultado === 'denegado')
        aviso('El navegador bloqueó las notificaciones. Puedes permitirlas en su configuración.');
    } catch {
      aviso('No pudimos cambiar las notificaciones del navegador.');
    }
  };

  const hayPush = Boolean(configuracion?.push?.clavePublica) && pushDisponible();
  return (
    <aside className="stack">
      <div className="panel stack" style={{ gap: 14 }} data-preferencias>
        <h3>Qué quiero que me avisen</h3>
        {preferencias === null ? (
          <span className="girando" role="status" aria-label="Cargando" />
        ) : (
          <>
            <Interruptor
              etiqueta="Ofertas y respuestas"
              marcado={preferencias.ofertas}
              alCambiar={(v) => void cambiar('ofertas', v)}
            />
            <div className="row g8">
              <span className="sw">
                <input type="checkbox" role="switch" checked disabled aria-label="Mis operaciones (siempre activo)" />
                <i aria-hidden="true" />
              </span>
              <span>
                Mis operaciones <span className="mini">· siempre activo</span>
              </span>
            </div>
            <Interruptor
              etiqueta="Premios, giros y desafíos"
              marcado={preferencias.premios}
              alCambiar={(v) => void cambiar('premios', v)}
            />
            <Interruptor
              etiqueta="Avisos y precios"
              marcado={preferencias.avisos}
              alCambiar={(v) => void cambiar('avisos', v)}
            />
          </>
        )}
        <p className="mini" style={{ margin: 0 }}>
          Los avisos sobre una operación tuya y los de seguridad de tu cuenta siempre llegan. Nunca enviamos avisos por
          WhatsApp.
        </p>
      </div>
      <div className="panel stack" style={{ gap: 10 }}>
        <h3>En este dispositivo</h3>
        {hayPush ? (
          <Interruptor
            etiqueta="Avisos aunque la app esté cerrada"
            marcado={push}
            alCambiar={(v) => void cambiarPush(v)}
          />
        ) : (
          <p className="mini" style={{ margin: 0 }}>
            Los avisos con la app cerrada no están disponibles en este navegador. Mientras la tengas abierta, llegan al
            instante.
          </p>
        )}
      </div>
    </aside>
  );
}
