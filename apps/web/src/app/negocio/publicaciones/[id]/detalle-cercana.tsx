'use client';

import { formatearFecha } from '@reciclomap/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, Estrellas, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { DialogoOferta } from '@/publicaciones/dialogo-oferta';
import {
  diasTexto,
  FichaMaterial,
  FotoPublicacion,
  kilos,
  soles,
  TarjetaReciclador,
  Vigencia,
} from '@/publicaciones/piezas';
import type { DetalleCercana } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

function PanelOferta({
  datos,
  alOfertar,
  alRetirar,
}: {
  datos: DetalleCercana;
  alOfertar: () => void;
  alRetirar: () => void;
}) {
  const mia = datos.miOferta;
  if (mia?.estado === 'PENDIENTE') {
    return (
      <>
        <h3>Tu oferta</h3>
        <div style={{ font: '800 32px var(--head)', color: 'var(--ink)' }}>
          {soles(mia.precioKg)} <small style={{ font: '500 14px var(--body)' }}>por kg</small>
        </div>
        <div className="mini" style={{ margin: '4px 0 14px' }}>
          Total {soles(mia.total)} · esperando respuesta
        </div>
        <span className="pill warn">
          <i />
          Esperando respuesta
        </span>
        <div className="row g8 wr" style={{ marginTop: 14 }}>
          <button type="button" className="btn sm" onClick={alOfertar}>
            Cambiar oferta
          </button>
          <button type="button" className="btn sm dn" onClick={alRetirar}>
            Retirar
          </button>
        </div>
      </>
    );
  }
  if (mia?.estado === 'ACEPTADA' && mia.operacionId) {
    return (
      <>
        <h3>Aceptaron tu oferta</h3>
        <p className="mini">Ya puedes ver el WhatsApp del reciclador y coordinar la entrega.</p>
        <Link className="btn p" href={`/operaciones/${mia.operacionId}`} style={{ width: '100%' }}>
          Ver la oferta aceptada
        </Link>
      </>
    );
  }
  if (mia?.estado === 'RECHAZADA' || mia?.estado === 'NO_SELECCIONADA') {
    return (
      <>
        <h3>Tu oferta</h3>
        <span className="pill grey">No fue seleccionada</span>
        <p className="mini" style={{ marginTop: 10 }}>
          {mia.estado === 'RECHAZADA'
            ? 'El reciclador no eligió tu oferta. No puedes volver a ofertar en esta publicación.'
            : 'El reciclador eligió otra oferta.'}
        </p>
      </>
    );
  }
  return (
    <>
      <h3>Haz tu oferta</h3>
      <p className="mini" style={{ marginBottom: 14 }}>
        El reciclador compara las ofertas y acepta una. Las demás quedan como “No seleccionada”.
      </p>
      <button type="button" className="btn p" style={{ width: '100%' }} onClick={alOfertar}>
        {mia?.estado === 'RETIRADA' ? 'Volver a ofertar' : 'Hacer oferta'}
      </button>
    </>
  );
}

function Contenido({ id }: { id: string }) {
  const aviso = useAviso();
  const [datos, setDatos] = useState<DetalleCercana | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ofertando, setOfertando] = useState(false);

  const cargar = useCallback(async () => {
    setDatos(await pedir<DetalleCercana>(`/negocio/publicaciones/${id}`));
  }, [id]);

  useEffect(() => {
    let vigente = true;
    pedir<DetalleCercana>(`/negocio/publicaciones/${id}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(
        (causa: unknown) => vigente && setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargarla.'),
      );
    return () => {
      vigente = false;
    };
  }, [id]);

  const retirar = async () => {
    if (!datos?.miOferta) return;
    try {
      await pedir(`/negocio/ofertas/${datos.miOferta.id}/retirar`, { cuerpo: {} });
      aviso('Oferta retirada');
      await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos retirar la oferta.');
    }
  };

  if (error) {
    return (
      <div className="note warn" role="alert">
        <Icono nombre="i-alert" />
        <span>
          {error} <Link href={RUTAS.publicacionesCercanas}>Ver otras publicaciones</Link>
        </span>
      </div>
    );
  }
  if (!datos) return <span className="girando" aria-label="Cargando" />;
  const p = datos;
  const medio = p.miPrecio ? (Number(p.miPrecio.min) + Number(p.miPrecio.max)) / 2 : 0;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Publicación cercana"
        titulo={`${p.material.nombre} ·`}
        resaltado={`${kilos(p.kg)} kg`}
        descripcion="Un reciclador verificado ofrece este material. Su nombre y WhatsApp se muestran solo si acepta tu oferta."
        acciones={
          <Link className="btn ghost" href={RUTAS.publicacionesCercanas}>
            <Icono nombre="i-arrow-left" />
            Publicaciones
          </Link>
        }
      />
      <div className="cols">
        <section className="stack">
          <div className="panel">
            <div className="row g16 wr">
              <FichaMaterial codigo={p.material.codigo} tamano={84} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="row g8 wr">
                  <span className="pill blue">
                    <i />
                    Disponible
                  </span>
                  <span className="pill grey">{diasTexto(p.diasRestantes)} de vigencia</span>
                </div>
                <div style={{ font: '800 30px var(--head)', marginTop: 6, color: 'var(--ink)' }}>
                  {p.precioEsperado ? (
                    <>
                      {soles(p.precioEsperado)} <small style={{ font: '500 14px var(--body)' }}>por kg que pide</small>
                    </>
                  ) : (
                    'Precio a convenir'
                  )}
                </div>
                <div className="mini row g8">
                  <Icono nombre="i-pin" tamano="sm" /> {p.reciclador.ciudad} · a {p.tramo ?? 'distancia no disponible'}{' '}
                  · ubicación aproximada
                </div>
              </div>
            </div>
            {p.fotos.length > 0 && (
              <div className="row g8 wr" style={{ marginTop: 14 }}>
                {p.fotos.map((foto, indice) => (
                  <FotoPublicacion key={foto} id={foto} alt={`Foto ${indice + 1} del material`} />
                ))}
              </div>
            )}
            {p.nota && <p style={{ marginTop: 12 }}>“{p.nota}”</p>}
            <hr className="divl" />
            <Vigencia dias={p.diasRestantes} />
          </div>
          <div className="panel">
            <h2>
              Contra tu precio <small>{p.material.nombre}</small>
            </h2>
            {p.miPrecio ? (
              <>
                <div className="grid3" style={{ gap: 12 }}>
                  <Kpi etiqueta="Tu rango" valor={`${soles(p.miPrecio.min)}–${p.miPrecio.max}`} />
                  <Kpi etiqueta="Pide" valor={p.precioEsperado ? soles(p.precioEsperado) : 'A convenir'} />
                  <Kpi etiqueta="Total a precio medio" valor={soles(medio * p.kg)} />
                </div>
                {p.precioEsperado && Number(p.precioEsperado) > Number(p.miPrecio.max) && (
                  <div className="note warn" style={{ marginTop: 14 }}>
                    <Icono nombre="i-alert" />
                    <span>Pide más que tu rango publicado. Puedes ofertar menos y que decida.</span>
                  </div>
                )}
              </>
            ) : (
              <div className="note warn">
                <Icono nombre="i-alert" />
                <span>
                  No tienes precio publicado para {p.material.nombre}.{' '}
                  <Link href={RUTAS.preciosDemanda} style={{ color: 'var(--deep)', fontWeight: 700 }}>
                    Agrégalo
                  </Link>{' '}
                  para ofertar con respaldo. Igual puedes ofertar.
                </span>
              </div>
            )}
          </div>
        </section>
        <aside className="stack">
          <div className="panel" data-panel="oferta">
            <PanelOferta datos={p} alOfertar={() => setOfertando(true)} alRetirar={() => void retirar()} />
          </div>
          <div className="panel">
            <h3>Reciclador</h3>
            <TarjetaReciclador reciclador={p.reciclador} />
            <div className="note" style={{ marginTop: 14 }}>
              <Icono nombre="i-lock" />
              <span>Su nombre y WhatsApp se muestran solo si acepta tu oferta.</span>
            </div>
            <h3 style={{ marginTop: 18 }}>Reseñas que recibió</h3>
            {p.resenas.length === 0 ? (
              <p className="mini">Aún no tiene reseñas.</p>
            ) : (
              <ul className="list" style={{ gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
                {p.resenas.map((resena) => (
                  <li
                    key={`${resena.creadaEn}-${resena.autor}`}
                    style={{ borderTop: '1.5px solid var(--line)', paddingTop: 10 }}
                  >
                    <div className="row sp wr">
                      <Estrellas valor={resena.estrellas} />
                      <span className="mini">{formatearFecha(resena.creadaEn)}</span>
                    </div>
                    {resena.etiquetas.length > 0 && (
                      <div className="row g8 wr" style={{ marginTop: 6 }}>
                        {resena.etiquetas.map((etiqueta) => (
                          <span key={etiqueta} className="pill grey">
                            {etiqueta}
                          </span>
                        ))}
                      </div>
                    )}
                    {resena.comentario && <p style={{ margin: '6px 0 0', fontSize: 14 }}>“{resena.comentario}”</p>}
                    <span className="mini">{resena.autor}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
      {ofertando && (
        <DialogoOferta
          objetivo={p}
          actual={p.miOferta}
          alCerrar={() => setOfertando(false)}
          alEnviar={() => {
            setOfertando(false);
            void cargar();
          }}
        />
      )}
    </>
  );
}

export function DetalleCercanaPagina({ id }: { id: string }) {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa="pubs">
        <Contenido id={id} />
      </MarcoApp>
    </Protegida>
  );
}
