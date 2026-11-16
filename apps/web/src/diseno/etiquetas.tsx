import { type Demanda, type Semaforo, TEXTO_DEMANDA, TEXTO_SEMAFORO } from '@reciclomap/shared';
import type { ReactNode } from 'react';
import { clases } from './clases';
import { Icono, type NombreIcono } from './icono';

const ESTILO_SEMAFORO: Record<Semaforo, { clase: string; icono: NombreIcono }> = {
  MEJOR: { clase: 'best', icono: 'i-tick' },
  INTERMEDIO: { clase: 'mid', icono: 'i-dash' },
  BAJO: { clase: 'low', icono: 'i-down' },
  SIN_COMPARACION: { clase: 'none', icono: 'i-dots' },
};

// Semáforo de precio relativo: siempre ícono y texto, nunca solo color
export function EtiquetaSemaforo({ semaforo, corto = false }: { semaforo: Semaforo; corto?: boolean }) {
  const { clase, icono } = ESTILO_SEMAFORO[semaforo];
  const textos = TEXTO_SEMAFORO[semaforo];
  return (
    <span className={clases('tag', clase)} data-semaforo={semaforo}>
      <Icono nombre={icono} />
      {corto ? textos.corto : textos.texto}
    </span>
  );
}

const NIVEL_DEMANDA: Record<Demanda, 1 | 2 | 3> = { BAJA: 1, MEDIA: 2, ALTA: 3 };

// Demanda: barras azules, independiente del semáforo
export function EtiquetaDemanda({ demanda, conTexto = true }: { demanda: Demanda; conTexto?: boolean }) {
  return (
    <span
      className={clases('dem', `d${NIVEL_DEMANDA[demanda]}`)}
      data-demanda={demanda}
      aria-label={conTexto ? undefined : TEXTO_DEMANDA[demanda]}
      role={conTexto ? undefined : 'img'}
    >
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {conTexto && TEXTO_DEMANDA[demanda]}
    </span>
  );
}

export type TonoPildora = 'abierto' | 'cerrado' | 'atencion' | 'gris' | 'info' | 'pro';

const CLASE_TONO: Record<TonoPildora, string> = {
  abierto: 'open',
  cerrado: 'closed',
  atencion: 'warn',
  gris: 'grey',
  info: 'blue',
  pro: 'pro',
};

export function Pildora({
  tono = 'gris',
  punto = false,
  children,
}: {
  tono?: TonoPildora;
  punto?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={clases('pill', CLASE_TONO[tono])}>
      {punto && <i aria-hidden="true" />}
      {children}
    </span>
  );
}

export function PildoraPro() {
  return <Pildora tono="pro">Pro</Pildora>;
}
