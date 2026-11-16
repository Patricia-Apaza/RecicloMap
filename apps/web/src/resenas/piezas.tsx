'use client';

import { esquemaReporteResena, formatearFecha } from '@reciclomap/shared';
import { useId, useState, type ReactNode } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Estrellas } from '@/diseno/bloques';
import type { Resena, ResumenResenas } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';

export function TarjetaResumen({ resumen }: { resumen: ResumenResenas }) {
  const promedio = resumen.promedio === null ? null : Number(resumen.promedio);
  const maximo = Math.max(1, ...resumen.distribucion.map((d) => d.cantidad));
  return (
    <div className="panel" data-resumen>
      <div className="row g16 wr" style={{ alignItems: 'center' }}>
        <div style={{ textAlign: 'center', minWidth: 110 }}>
          {resumen.nuevo || promedio === null ? (
            <>
              <span className="pill grey">Nuevo</span>
              <div className="mini" style={{ marginTop: 6 }}>
                Menos de 3 reseñas
              </div>
            </>
          ) : (
            <>
              <div style={{ font: '800 48px/1 var(--head)', color: 'var(--ink)' }} data-promedio>
                {promedio.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <Estrellas valor={promedio} cantidad={resumen.cantidad} />
            </>
          )}
          <div className="mini">
            {resumen.cantidad} {resumen.cantidad === 1 ? 'reseña' : 'reseñas'}
          </div>
        </div>
        <div className="stack" style={{ flex: 1, gap: 6, minWidth: 180 }}>
          {resumen.distribucion.map((d) => (
            <div key={d.estrellas} className="row g8" style={{ fontSize: 13 }}>
              <span className="mono" style={{ width: 18 }}>
                {d.estrellas}★
              </span>
              <span style={{ flex: 1, height: 8, borderRadius: 8, background: 'var(--paper2)', overflow: 'hidden' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${(d.cantidad / maximo) * 100}%`,
                    background: 'var(--btn)',
                  }}
                />
              </span>
              <span className="mono mini" style={{ width: 22, textAlign: 'right' }}>
                {d.cantidad}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TarjetaResena({
  resena,
  tituloRespuesta,
  acciones,
}: {
  resena: Resena;
  tituloRespuesta: string;
  acciones?: ReactNode;
}) {
  return (
    <article className="panel" data-resena={resena.id} style={{ padding: 16 }}>
      <div className="row sp wr" style={{ gap: 8 }}>
        <b style={{ font: '700 16px var(--head)', color: 'var(--ink)' }} data-autor>
          {resena.autor}
        </b>
        <span className="mini">{formatearFecha(resena.creadaEn)}</span>
      </div>
      <Estrellas valor={resena.estrellas} />
      {resena.etiquetas.length > 0 && (
        <div className="row wr g8" style={{ marginTop: 8 }}>
          {resena.etiquetas.map((etiqueta) => (
            <span key={etiqueta} className="pill grey">
              {etiqueta}
            </span>
          ))}
        </div>
      )}
      {resena.comentario && <p style={{ margin: '10px 0 0' }}>{resena.comentario}</p>}
      {resena.respuesta && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderLeft: '3px solid var(--btn)',
            background: 'var(--paper)',
            borderRadius: 8,
          }}
          data-respuesta
        >
          <b style={{ fontSize: 13 }}>{tituloRespuesta}</b>
          <p style={{ margin: '4px 0 0', fontSize: 14 }}>{resena.respuesta.texto}</p>
        </div>
      )}
      {acciones && (
        <div className="row g8 wr" style={{ marginTop: 12 }}>
          {acciones}
        </div>
      )}
    </article>
  );
}

// Cualquier reseña se puede reportar; queda guardada para la moderación
export function DialogoReportar({
  resena,
  alCerrar,
  alReportar,
}: {
  resena: Resena | null;
  alCerrar: () => void;
  alReportar: (id: string) => void;
}) {
  const aviso = useAviso();
  const id = useId();
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (!resena) return;
    const lectura = esquemaReporteResena.safeParse({ detalle: detalle.trim() || null });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Revisa el detalle.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/resenas/${resena.id}/reportes`, { cuerpo: lectura.data });
      aviso('Reseña reportada. El equipo de RecicloMap la revisará.');
      setDetalle('');
      alReportar(resena.id);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar el reporte.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana
      abierta={resena !== null}
      alCerrar={alCerrar}
      antetitulo="REPORTAR RESEÑA"
      titulo="¿Qué tiene de malo esta reseña?"
    >
      <p className="mini">La revisará el equipo de RecicloMap. La reseña sigue visible mientras tanto.</p>
      <div className={error ? 'field err' : 'field'}>
        <label htmlFor={id}>
          Detalle <span className="opt">(opcional)</span>
        </label>
        <div className="inp ta">
          <textarea id={id} rows={3} maxLength={300} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        </div>
        {error && (
          <span className="msg" role="alert">
            {error}
          </span>
        )}
      </div>
      <button type="button" className="btn dn" disabled={enviando} onClick={() => void enviar()}>
        {enviando ? 'Enviando…' : 'Reportar'}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}
