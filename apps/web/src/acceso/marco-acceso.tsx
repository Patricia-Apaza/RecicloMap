import Link from 'next/link';
import type { ReactNode } from 'react';
import { clases } from '@/diseno/clases';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { LogoMarca } from '@/diseno/logo';
import { RUTAS } from '@/navegacion/rutas';
import './acceso.css';

export type TextoLado = {
  antetitulo: string;
  titulo: string;
  resaltado: string;
  texto: string;
  chips: Array<{ icono: NombreIcono; texto: string }>;
  enColumna?: boolean;
};

export function Contorno({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 600" aria-hidden="true" focusable="false">
      <use href="/contorno.svg#contour" />
    </svg>
  );
}

// Marco común de las pantallas 02 a 08: tarjeta en el celular, columna de marca en escritorio
export function MarcoAcceso({ lado, ancho, children }: { lado?: TextoLado; ancho?: boolean; children: ReactNode }) {
  return (
    <div className={clases('ac', ancho && 'ancha')}>
      <Contorno className="ac-fondo a" />
      <Contorno className="ac-fondo b" />
      <header className="ac-topnav">
        <Link className="brand" href={RUTAS.bienvenida} aria-label="RecicloMap, inicio">
          <LogoMarca />
          <span>
            Reciclo<em>Map</em>
          </span>
        </Link>
        <Link className="atras" href={RUTAS.bienvenida}>
          <Icono nombre="i-arrow-left" tamano="sm" />
          Volver al inicio
        </Link>
      </header>
      {lado && !ancho && (
        <aside className="ac-lado">
          <div className="copia">
            <span className="kick-lado">{lado.antetitulo}</span>
            <h2>
              {lado.titulo} <em>{lado.resaltado}</em>
            </h2>
            <p>{lado.texto}</p>
            <div className={clases('chips', lado.enColumna !== false && 'columna')}>
              {lado.chips.map((chip) => (
                <span key={chip.texto}>
                  <Icono nombre={chip.icono} tamano="sm" />
                  {chip.texto}
                </span>
              ))}
            </div>
          </div>
        </aside>
      )}
      <main className={clases('ac-app', ancho && 'ancha')}>{children}</main>
    </div>
  );
}

export function BarraAcceso({
  volver,
  etiquetaVolver = 'Volver',
  derecha,
}: {
  volver?: string;
  etiquetaVolver?: string;
  derecha?: ReactNode;
}) {
  return (
    <div className="ac-barra">
      {volver ? (
        <Link className="ac-volver" href={volver} aria-label={etiquetaVolver}>
          <Icono nombre="i-arrow-left" />
        </Link>
      ) : (
        <LogoMarca tamano={36} />
      )}
      {derecha ?? (volver ? <LogoMarca tamano={36} /> : null)}
    </div>
  );
}

export function Progreso({ porcentaje, etiqueta, suelto }: { porcentaje: number; etiqueta: string; suelto?: boolean }) {
  return (
    <div
      className={clases('ac-progreso', suelto && 'suelto')}
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={porcentaje}
    >
      <i style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

export function AvisoAcceso({ tono, children }: { tono: 'err' | 'ok' | 'info' | 'warn'; children: ReactNode }) {
  const icono: NombreIcono = tono === 'ok' ? 'i-check' : tono === 'err' ? 'i-alert' : 'i-info';
  return (
    <div className={clases('ac-aviso', tono)} role={tono === 'err' ? 'alert' : undefined}>
      <Icono nombre={icono} />
      <span>{children}</span>
    </div>
  );
}

export function Girando({ oscuro }: { oscuro?: boolean }) {
  return <span className={clases('ac-girando', oscuro && 'oscuro')} aria-hidden="true" />;
}
