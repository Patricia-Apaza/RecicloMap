'use client';

import {
  type CodigoMaterial,
  type EstadoOferta,
  type EstadoPublicacion,
  formatearSoles,
  TEXTO_OFERTA,
  TEXTO_PUBLICACION,
} from '@reciclomap/shared';
import { useFotoProtegida } from '@/acceso/fotos';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { BarraProgreso, Estrellas } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import type { CalificacionPublica, RecicladorPublico } from './tipos';

export const FONDO_MATERIAL: Record<CodigoMaterial, string> = {
  pet: 'var(--sky)',
  carton: 'var(--sand)',
  papel: '#fff',
  plastico: 'var(--mint)',
  metal: 'var(--lilac)',
};

const TONO_PUBLICACION: Record<EstadoPublicacion, string> = {
  DISPONIBLE: 'blue',
  CON_OFERTAS: 'warn',
  EN_NEGOCIACION: 'open',
  FINALIZADA: 'grey',
  CANCELADA: 'closed',
  VENCIDA: 'grey',
};

const TONO_OFERTA: Record<EstadoOferta, string> = {
  PENDIENTE: 'warn',
  ACEPTADA: 'blue',
  RECHAZADA: 'grey',
  NO_SELECCIONADA: 'grey',
  RETIRADA: 'grey',
};

export const soles = (valor: number | string) => formatearSoles(valor);
export const kilos = (valor: number) => valor.toLocaleString('es-PE', { maximumFractionDigits: 2 });

export function FichaMaterial({ codigo, tamano = 44 }: { codigo: CodigoMaterial; tamano?: number }) {
  return (
    <span
      className="mi"
      style={{ width: tamano, height: tamano, background: FONDO_MATERIAL[codigo] }}
      aria-hidden="true"
    >
      <Icono nombre={ICONO_MATERIAL[codigo]} tamano={tamano >= 56 ? 'lg' : undefined} />
    </span>
  );
}

export function PildoraPublicacion({ estado }: { estado: EstadoPublicacion }) {
  return (
    <span className={`pill ${TONO_PUBLICACION[estado]}`} data-estado={estado}>
      <i />
      {TEXTO_PUBLICACION[estado]}
    </span>
  );
}

export function PildoraOferta({ estado }: { estado: EstadoOferta }) {
  return (
    <span className={`pill ${TONO_OFERTA[estado]}`} data-estado={estado}>
      <i />
      {estado === 'RECHAZADA' ? 'Rechazada' : TEXTO_OFERTA[estado]}
    </span>
  );
}

export function Vigencia({ dias, total = 7 }: { dias: number; total?: number }) {
  return (
    <div>
      <div className="row sp mini" style={{ marginBottom: 6 }}>
        <span>Vigencia</span>
        <b className="mono">
          {dias} de {total} días
        </b>
      </div>
      <BarraProgreso valor={dias} maximo={total} etiqueta={`Le quedan ${dias} de ${total} días`} />
    </div>
  );
}

export function Calificacion({ calificacion }: { calificacion: CalificacionPublica }) {
  if (calificacion.nuevo || calificacion.promedio === null) return <span className="pill grey">Nuevo</span>;
  return (
    <span className="row g8">
      <Estrellas valor={Number(calificacion.promedio)} cantidad={calificacion.cantidad} />
      <b className="mono">{calificacion.promedio}</b>
      <span className="mini">({calificacion.cantidad})</span>
    </span>
  );
}

// Lo único que un negocio sabe del reciclador antes de que acepte (S1)
export function TarjetaReciclador({
  reciclador,
  compacta = false,
}: {
  reciclador: RecicladorPublico;
  compacta?: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 10 }} data-reciclador>
      <div className="row g16">
        <span className="ico l" style={{ width: compacta ? 40 : 52, height: compacta ? 40 : 52 }}>
          <Icono nombre="i-user" />
        </span>
        <div>
          <b style={{ font: '700 16px var(--head)', color: 'var(--ink)' }}>{reciclador.alias}</b>
          <div className="mini">
            {reciclador.ciudad} · Nivel {reciclador.nivel.nombre}
          </div>
        </div>
      </div>
      <div className="row g8 wr">
        <Calificacion calificacion={reciclador.calificacion} />
        <span className="mini">
          {reciclador.operaciones} {reciclador.operaciones === 1 ? 'operación' : 'operaciones'}
        </span>
      </div>
      {!compacta && (reciclador.confiable || reciclador.telefonoVerificado) && (
        <div className="row g8 wr">
          {reciclador.confiable && (
            <span className="pill open">
              <Icono nombre="i-shield" tamano="sm" />
              Reciclador Confiable
            </span>
          )}
          {reciclador.telefonoVerificado && (
            <span className="pill blue">
              <Icono nombre="i-phone" tamano="sm" />
              Teléfono verificado
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Fotos de una publicación: se piden con la sesión, nunca con un enlace público
export function FotoPublicacion({ id, alt }: { id: string; alt: string }) {
  const url = useFotoProtegida(id, 'mini');
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- foto privada leída con la sesión
    <img
      src={url}
      alt={alt}
      style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 14, border: '2px solid var(--ink)' }}
    />
  ) : (
    <span className="ico m" style={{ width: 76, height: 76, borderRadius: 14 }} aria-hidden="true">
      <Icono nombre="i-camera" />
    </span>
  );
}

export const diasTexto = (dias: number) => `${dias} ${dias === 1 ? 'día' : 'días'}`;
