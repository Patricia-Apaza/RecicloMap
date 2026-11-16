'use client';

import type { CodigoMaterial, Demanda, PeriodoEstadisticas, Semaforo } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { ErrorApi, pedir } from '@/sesion/api';

export type Barra = { desde: string; hasta: string; valor: number };
export type RequierePro = { requierePro: true };
export type Estadisticas = {
  periodo: PeriodoEstadisticas;
  plan: 'GRATIS' | 'PRO';
  requierePro?: true;
  desde?: string;
  hasta?: string;
  sinDatos?: boolean;
  visitas?: { total: number; serie: Barra[] };
  llegadas?: { total: number; porMaterial: Array<{ material: CodigoMaterial; cantidad: number }>; serie: Barra[] };
  ofertas?: { enviadas: number; aceptadas: number };
  kg?: {
    total: number;
    compras: number;
    serie: Barra[];
    porMaterial: Array<{ material: CodigoMaterial; kg: number; porcentaje: number }>;
  };
  precioFrenteAlMercado?: Array<{
    material: { codigo: CodigoMaterial; nombre: string };
    min: string;
    max: string;
    demanda: Demanda;
    antiguo: boolean;
    semaforo: { clave: Semaforo; texto: string; comparadoEntre: number } | null;
    moderacion: { estado: string; motivo: string } | null;
  }>;
  horasConMasVisitas?: RequierePro | Array<{ hora: number; visitas: number }>;
  materialesMasConsultados?: RequierePro | Array<{ material: CodigoMaterial; consultas: number; porcentaje: number }>;
};

export const esRequierePro = (valor: unknown): valor is RequierePro =>
  typeof valor === 'object' && valor !== null && 'requierePro' in valor;

export function useEstadisticas(periodo: PeriodoEstadisticas) {
  const [estado, setEstado] = useState<{ datos: Estadisticas | null; error: string | null; periodo: number }>({
    datos: null,
    error: null,
    periodo,
  });
  useEffect(() => {
    let vigente = true;
    pedir<Estadisticas>(`/mi-negocio/estadisticas?periodo=${periodo}`)
      .then((datos) => vigente && setEstado({ datos, error: null, periodo }))
      .catch(
        (causa: unknown) =>
          vigente &&
          setEstado({
            datos: null,
            error: causa instanceof ErrorApi ? causa.message : 'No pudimos cargar tus números.',
            periodo,
          }),
      );
    return () => {
      vigente = false;
    };
  }, [periodo]);
  return estado.periodo === periodo ? estado : { datos: null, error: null, periodo };
}

const fecha = (texto: string) => new Date(`${texto}T12:00:00Z`);
export function etiquetaBarra(barra: Barra): string {
  if (barra.desde === barra.hasta) {
    return fecha(barra.desde)
      .toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
      .replace('.', '');
  }
  return fecha(barra.desde)
    .toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

// Barras sencillas: el valor siempre va escrito y el gráfico tiene un resumen para lectores de pantalla
export function GraficoBarras({
  serie,
  titulo,
  unidad = '',
  color = '#CFE3F2',
  etiqueta = etiquetaBarra,
}: {
  serie: Barra[];
  titulo: string;
  unidad?: string;
  color?: string;
  etiqueta?: (barra: Barra) => string;
}) {
  const maximo = Math.max(...serie.map((b) => b.valor), 1);
  const ancho = 700;
  const alto = 220;
  const n = serie.length;
  const grosor = Math.min(56, (ancho - 60) / n - 8);
  const hueco = (ancho - 60 - grosor * n) / (n + 1);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${ancho} ${alto}`}
      role="img"
      aria-label={`${titulo}: ${serie.map((b) => `${etiqueta(b)} ${b.valor}${unidad}`).join(', ')}`}
      data-grafico={titulo}
    >
      {[0, 0.5, 1].map((t) => {
        const y = 180 - t * 140;
        return (
          <g key={t}>
            <line x1="40" x2="690" y1={y} y2={y} stroke="rgba(18,48,31,.14)" strokeDasharray="3 5" />
            <text x="0" y={y + 4} fontFamily="IBM Plex Mono" fontSize="10" fill="#5E6E65">
              {Math.round(maximo * t)}
            </text>
          </g>
        );
      })}
      {serie.map((barra, i) => {
        const x = 50 + hueco + i * (grosor + hueco);
        const h = (barra.valor / maximo) * 140;
        const mayor = barra.valor === maximo && barra.valor > 0;
        return (
          <g key={barra.desde}>
            <rect
              x={x}
              y={180 - h}
              width={grosor}
              height={Math.max(h, barra.valor > 0 ? 3 : 0)}
              rx="7"
              fill={mayor ? '#B7E36B' : color}
              stroke="#12301F"
              strokeWidth="2"
            />
            {barra.valor > 0 && (
              <text
                x={x + grosor / 2}
                y={172 - h}
                textAnchor="middle"
                fontFamily="IBM Plex Mono"
                fontWeight="600"
                fontSize="11"
                fill="#12301F"
              >
                {barra.valor}
              </text>
            )}
            <text x={x + grosor / 2} y={202} textAnchor="middle" fontFamily="Inter" fontSize="11" fill="#5E6E65">
              {etiqueta(barra)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// El plan Gratis ve el bloque, pero la API no le envía ningún dato
export function BloquePro({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="panel" data-bloque-pro style={{ background: 'var(--paper2)', borderStyle: 'dashed' }}>
      <div className="row g8">
        <Icono nombre="i-lock" />
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <span className="pill pro" style={{ marginLeft: 'auto' }}>
          Pro
        </span>
      </div>
      <p className="mini" style={{ margin: '8px 0 0' }}>
        {descripcion}
      </p>
      <p style={{ margin: '10px 0 0', font: '700 14px var(--head)' }}>Disponible con plan Pro</p>
    </div>
  );
}

export function SinDatos({ texto = 'Aún sin datos' }: { texto?: string }) {
  return (
    <div className="empty" role="status" data-sin-datos>
      <span className="ico m">
        <Icono nombre="i-activity" />
      </span>
      <b style={{ font: '700 17px var(--head)', color: 'var(--ink)' }}>{texto}</b>
      <span className="mini">Cuando haya actividad, la verás aquí. No inventamos cifras.</span>
    </div>
  );
}
