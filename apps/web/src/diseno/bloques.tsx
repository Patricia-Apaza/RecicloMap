import { formatearNumero } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import type { ReactNode } from 'react';
import { clases } from './clases';
import { Icono, type NombreIcono } from './icono';

export function EncabezadoPagina({
  antetitulo,
  titulo,
  resaltado,
  descripcion,
  acciones,
}: {
  antetitulo: string;
  titulo: string;
  resaltado?: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <span className="kick">{antetitulo}</span>
        <h1>
          {titulo} {resaltado && <u>{resaltado}</u>}
        </h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {acciones}
    </div>
  );
}

export function Panel({
  variante,
  className,
  children,
}: {
  variante?: 'plano' | 'oscuro';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clases('panel', variante === 'plano' && 'flat', variante === 'oscuro' && 'dark', className)}>
      {children}
    </div>
  );
}

export type FondoKpi = 'sky' | 'sand' | 'mint' | 'lilac' | 'blanco';

export function Kpi({
  etiqueta,
  valor,
  unidad,
  detalle,
  icono,
  fondo = 'blanco',
}: {
  etiqueta: string;
  valor: ReactNode;
  unidad?: string;
  detalle?: ReactNode;
  icono?: NombreIcono;
  fondo?: FondoKpi;
}) {
  return (
    <div className={clases('kpi', fondo !== 'blanco' && fondo)}>
      <div className="l">
        {etiqueta}
        {icono && <Icono nombre={icono} />}
      </div>
      <div className="v">
        {valor}
        {unidad && <small> {unidad}</small>}
      </div>
      {detalle && <div className="d">{detalle}</div>}
    </div>
  );
}

export function ChipPuntos({ puntos, href }: { puntos: number; href?: string }) {
  const contenido = (
    <>
      <Icono nombre="i-star" />
      {formatearNumero(puntos)} pts
    </>
  );
  return href ? (
    <Link className="chip-pts" href={href} aria-label={`${formatearNumero(puntos)} puntos`}>
      {contenido}
    </Link>
  ) : (
    <span className="chip-pts">{contenido}</span>
  );
}

export function Nota({ tono = 'info', children }: { tono?: 'info' | 'atencion' | 'oscura'; children: ReactNode }) {
  const icono: NombreIcono = tono === 'atencion' ? 'i-alert' : 'i-info';
  return (
    <div className={clases('note', tono === 'atencion' && 'warn', tono === 'oscura' && 'dk')}>
      <Icono nombre={icono} />
      <span>{children}</span>
    </div>
  );
}

export function EstadoVacio({
  icono = 'i-check',
  titulo,
  descripcion,
  accion,
}: {
  icono?: NombreIcono;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="empty" role="status">
      <span className="ico m">
        <Icono nombre={icono} />
      </span>
      <b style={{ fontFamily: 'var(--head)', color: 'var(--ink)' }}>{titulo}</b>
      {descripcion && <span className="mini">{descripcion}</span>}
      {accion}
    </div>
  );
}

export function BarraProgreso({ valor, maximo, etiqueta }: { valor: number; maximo: number; etiqueta: string }) {
  const porcentaje = maximo > 0 ? Math.min(100, Math.max(0, (valor / maximo) * 100)) : 0;
  return (
    <div
      className="prog"
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={Math.min(valor, maximo)}
    >
      <i style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

export function Estrellas({ valor, cantidad }: { valor: number; cantidad?: number }) {
  const llenas = Math.round(valor);
  return (
    <span
      className="stars ro"
      role="img"
      aria-label={`${valor.toFixed(1)} de 5 estrellas${cantidad !== undefined ? `, ${cantidad} calificaciones` : ''}`}
    >
      {[1, 2, 3, 4, 5].map((posicion) => (
        <button key={posicion} type="button" tabIndex={-1} className={posicion <= llenas ? 'on' : undefined}>
          <Icono nombre="i-star" />
        </button>
      ))}
    </span>
  );
}

// Calificación de un negocio: con menos de 3 calificaciones se muestra "Nuevo"
export function Reputacion({ promedio, cantidad }: { promedio: number; cantidad: number }) {
  if (cantidad < 3) {
    return <span className="pill grey">Nuevo</span>;
  }
  return (
    <span className="row g8" style={{ gap: 4, color: 'var(--ink)', fontSize: 13 }}>
      <Icono nombre="i-star" tamano="sm" className="text-estrella fill-estrella" />
      <b>{promedio.toFixed(1)}</b>
      <small className="mini">({cantidad})</small>
    </span>
  );
}
