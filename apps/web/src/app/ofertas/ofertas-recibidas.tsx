'use client';

import { enlaceWhatsApp } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Interruptor } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { TEXTO_VEHICULO } from '@/mapa/resultados';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import {
  Calificacion,
  diasTexto,
  FichaMaterial,
  kilos,
  PildoraOferta,
  PildoraPublicacion,
  soles,
} from '@/publicaciones/piezas';
import type { MisPublicaciones, OfertaRecibida, OfertasRecibidas, Publicacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { DialogoCancelar } from '../publicaciones/mis-publicaciones';
import { EtiquetaDestacadoPro } from '@/diseno/etiquetas';

function ItemPublicacion({
  publicacion,
  elegida,
  alElegir,
}: {
  publicacion: Publicacion;
  elegida: boolean;
  alElegir: () => void;
}) {
  const p = publicacion;
  return (
    <button
      type="button"
      className="panel"
      onClick={alElegir}
      aria-pressed={elegida}
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        ...(elegida
          ? { background: '#F3FAE6', boxShadow: '5px 5px 0 var(--g)' }
          : { boxShadow: '3px 3px 0 var(--ink)' }),
      }}
    >
      <span className="row g16">
        <FichaMaterial codigo={p.material.codigo} />
        <span style={{ flex: 1 }}>
          <b style={{ font: '800 18px var(--head)', color: 'var(--ink)', display: 'block' }}>
            {p.material.nombre} · {kilos(p.kg)} kg
          </b>
          <span className="mini">
            {p.precioEsperado ? `Esperas ${soles(p.precioEsperado)} por kg` : 'Sin precio esperado'}
          </span>
        </span>
      </span>
      <span className="row sp wr">
        <PildoraPublicacion estado={p.estado} />
        {p.ofertas.pendientes > 0 ? (
          <span className="pill" style={{ background: 'var(--lime)', color: 'var(--ink)' }}>
            {p.ofertas.pendientes} {p.ofertas.pendientes === 1 ? 'oferta nueva' : 'ofertas nuevas'}
          </span>
        ) : (
          p.estado === 'DISPONIBLE' && <span className="mini">Vence en {diasTexto(p.diasRestantes)}</span>
        )}
      </span>
    </button>
  );
}

function TarjetaOferta({
  oferta,
  publicacion,
  mayorTotal,
  alAceptar,
  alRechazar,
}: {
  oferta: OfertaRecibida;
  publicacion: Publicacion;
  mayorTotal: boolean;
  alAceptar: () => void;
  alRechazar: () => void;
}) {
  const n = oferta.negocio;
  const noSeleccionada = oferta.estado === 'NO_SELECCIONADA';
  const aceptada = oferta.estado === 'ACEPTADA';
  const responder = publicacion.estado === 'CON_OFERTAS' && oferta.estado === 'PENDIENTE';
  return (
    <article
      className="panel"
      data-oferta={oferta.id}
      style={{
        padding: 18,
        ...(noSeleccionada ? { opacity: 0.6, boxShadow: 'none' } : {}),
        ...(aceptada ? { background: '#F3FAE6', boxShadow: '5px 5px 0 var(--g)' } : {}),
      }}
    >
      <div className="row g16 wr">
        <span className={n.tipo === 'CENTRO' ? 'ico' : 'ico s'} aria-hidden="true">
          <Icono nombre={n.tipo === 'CENTRO' ? 'i-store' : 'i-truck'} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row g8 wr">
            <b style={{ font: '800 18px var(--head)', color: 'var(--ink)' }}>{n.nombre}</b>
            {n.esPro && <EtiquetaDestacadoPro />}
            {oferta.estado !== 'PENDIENTE' && <PildoraOferta estado={oferta.estado} />}
            {mayorTotal && (
              <span className="pill" style={{ background: 'var(--lime)', color: 'var(--ink)' }}>
                Mayor total
              </span>
            )}
          </div>
          <div className="mini row wr" style={{ gap: '4px 12px', marginTop: 3 }}>
            <Calificacion calificacion={n.calificacion} />
            {n.distanciaKm !== null && (
              <span>
                <Icono nombre="i-pin" tamano="sm" />{' '}
                {n.distanciaKm < 0.1 ? 'a menos de 100 m' : `a ${n.distanciaKm.toFixed(1)} km`}
              </span>
            )}
            <span>
              {n.tipo === 'CENTRO' ? 'Centro de acopio' : `${TEXTO_VEHICULO[n.vehiculo ?? ''] ?? 'Vehículo'} · móvil`}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ font: '600 22px var(--mono)', color: 'var(--ink)' }} data-total>
            {soles(oferta.total)}
          </div>
          <div className="mini">
            {soles(oferta.precioKg)} por kg × {kilos(publicacion.kg)} kg
          </div>
        </div>
      </div>
      {(oferta.mensaje || oferta.cuandoRecoge) && (
        <p
          style={{
            margin: '12px 0 0',
            padding: '10px 12px',
            background: 'var(--paper)',
            borderRadius: 12,
            fontSize: 14,
            color: 'var(--ink)',
          }}
        >
          {oferta.mensaje ? `“${oferta.mensaje}”` : ''}
          {oferta.cuandoRecoge && (
            <span className="mini" style={{ display: 'block' }}>
              Recoge: {oferta.cuandoRecoge}
              {oferta.modificada ? ' · oferta modificada' : ''}
            </span>
          )}
        </p>
      )}
      {responder && (
        <div className="row wr g8" style={{ marginTop: 12 }}>
          <button type="button" className="btn p sm" onClick={alAceptar}>
            <Icono nombre="i-check" />
            Aceptar oferta
          </button>
          <button type="button" className="btn sm" onClick={alRechazar}>
            Rechazar
          </button>
          <a className="btn sm ghost" href={enlaceWhatsApp(n.whatsapp)} target="_blank" rel="noopener noreferrer">
            <Icono nombre="i-whatsapp" />
            Escribir por WhatsApp
          </a>
        </div>
      )}
      {aceptada && publicacion.operacion && (
        <div className="row wr g8" style={{ marginTop: 12 }}>
          <Link className="btn p sm" href={`/operaciones/${publicacion.operacion.id}`}>
            Ver la oferta aceptada
            <Icono nombre="i-arrow-right" />
          </Link>
        </div>
      )}
    </article>
  );
}

function Contenido() {
  const aviso = useAviso();
  const router = useRouter();
  const consulta = useSearchParams();
  const [lista, setLista] = useState<Publicacion[] | null>(null);
  const [detalle, setDetalle] = useState<OfertasRecibidas | null>(null);
  const [alcance, setAlcance] = useState<number | null>(null);
  const [comparar, setComparar] = useState(false);
  const [aceptando, setAceptando] = useState<OfertaRecibida | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const pedida = consulta.get('publicacion');
  const elegida = pedida ?? lista?.find((p) => p.estado === 'CON_OFERTAS')?.id ?? lista?.[0]?.id ?? null;

  const cargarLista = useCallback(async () => {
    const respuesta = await pedir<MisPublicaciones>('/publicaciones?grupo=activas');
    setLista(respuesta.datos);
  }, []);
  const cargarDetalle = useCallback(async (id: string) => {
    setDetalle(await pedir<OfertasRecibidas>(`/publicaciones/${id}/ofertas`));
  }, []);

  useEffect(() => {
    let vigente = true;
    Promise.all([
      pedir<MisPublicaciones>('/publicaciones?grupo=activas'),
      pedir<{ negocios: number }>('/publicaciones/alcance'),
    ])
      .then(([respuesta, alcanceRespuesta]) => {
        if (!vigente) return;
        setLista(respuesta.datos);
        setAlcance(alcanceRespuesta.negocios);
      })
      .catch(() => vigente && setLista([]));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (!elegida) return;
    let vigente = true;
    pedir<OfertasRecibidas>(`/publicaciones/${elegida}/ofertas`)
      .then((respuesta) => vigente && setDetalle(respuesta))
      .catch(() => vigente && setDetalle(null));
    return () => {
      vigente = false;
    };
  }, [elegida]);

  const refrescar = async () => {
    await cargarLista();
    if (elegida) await cargarDetalle(elegida);
  };

  const aceptar = async () => {
    if (!aceptando) return;
    setEnviando(true);
    try {
      const respuesta = await pedir<{ operacionId: string }>(`/ofertas/${aceptando.id}/aceptar`, { cuerpo: {} });
      setAceptando(null);
      aviso('Oferta aceptada. Ya pueden coordinar la entrega por WhatsApp.');
      router.push(`/operaciones/${respuesta.operacionId}`);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos aceptar la oferta.');
      setAceptando(null);
      await refrescar();
    } finally {
      setEnviando(false);
    }
  };

  const rechazar = async (oferta: OfertaRecibida) => {
    try {
      await pedir(`/ofertas/${oferta.id}/rechazar`, { cuerpo: {} });
      aviso('Oferta rechazada');
      await refrescar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos rechazar la oferta.');
    }
  };

  const publicacion = detalle?.publicacion;
  const ofertas = detalle
    ? [...detalle.ofertas].sort((a, b) => (comparar ? Number(b.total) - Number(a.total) : 0))
    : [];

  return (
    <>
      <EncabezadoPagina
        antetitulo="Mis publicaciones"
        titulo="Ofertas"
        resaltado="que te llegaron"
        descripcion="Compara por total, no solo por precio por kilo. Al aceptar una, las demás pasan a “No seleccionada”."
        acciones={
          <Link className="btn p" href={RUTAS.publicar}>
            Publicar material
          </Link>
        }
      />
      <div className="cols l">
        <section className="stack" aria-label="Tus publicaciones activas">
          {lista === null && <span className="girando" role="status" aria-label="Cargando" />}
          {lista?.length === 0 && (
            <EstadoVacio
              icono="i-recycle"
              titulo="Aún no publicas nada"
              descripcion="Publica tu material y los compradores de tu ciudad te harán ofertas."
              accion={
                <Link className="btn p" href={RUTAS.publicar}>
                  Publicar material
                </Link>
              }
            />
          )}
          {lista?.map((p) => (
            <ItemPublicacion
              key={p.id}
              publicacion={p}
              elegida={p.id === elegida}
              alElegir={() => router.replace(`${RUTAS.ofertas}?publicacion=${p.id}`, { scroll: false })}
            />
          ))}
        </section>
        <section className="stack" aria-label="Ofertas de la publicación elegida">
          {publicacion && (
            <div className="panel">
              <div className="row sp wr">
                <div className="row g16">
                  <FichaMaterial codigo={publicacion.material.codigo} tamano={56} />
                  <div>
                    <h2 style={{ margin: 0, font: '800 28px var(--head)' }}>
                      {publicacion.material.nombre} · {kilos(publicacion.kg)} kg
                    </h2>
                    <div className="mini row wr g8" style={{ marginTop: 2 }}>
                      <Icono nombre="i-pin" tamano="sm" /> Juliaca · ubicación aproximada{' '}
                      <PildoraPublicacion estado={publicacion.estado} />
                      {(publicacion.estado === 'DISPONIBLE' || publicacion.estado === 'CON_OFERTAS') && (
                        <span>Vence en {diasTexto(publicacion.diasRestantes)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {publicacion.estado === 'CON_OFERTAS' && ofertas.length > 1 && (
                  <Interruptor etiqueta="Comparar por total" marcado={comparar} alCambiar={setComparar} />
                )}
              </div>
            </div>
          )}
          {publicacion && ofertas.length === 0 && (
            <EstadoVacio
              icono="i-bell"
              titulo="Aún no hay ofertas"
              descripcion={`Tu publicación la pueden ver ${alcance ?? 'los'} compradores y centros verificados de tu ciudad. Te avisaremos apenas llegue una.`}
            />
          )}
          {publicacion &&
            ofertas.map((oferta) => (
              <TarjetaOferta
                key={oferta.id}
                oferta={oferta}
                publicacion={publicacion}
                mayorTotal={comparar && detalle?.mayorTotalId === oferta.id}
                alAceptar={() => setAceptando(oferta)}
                alRechazar={() => void rechazar(oferta)}
              />
            ))}
          {publicacion && (publicacion.estado === 'DISPONIBLE' || publicacion.estado === 'CON_OFERTAS') && (
            <div className="row wr g8">
              <button type="button" className="btn sm" onClick={() => setCancelando(true)}>
                Cancelar publicación
              </button>
            </div>
          )}
        </section>
      </div>
      <Ventana
        abierta={aceptando !== null}
        alCerrar={() => setAceptando(null)}
        antetitulo="CONFIRMA"
        titulo={`¿Aceptar la oferta de ${aceptando?.negocio.nombre ?? ''}?`}
      >
        {aceptando && publicacion && (
          <p>
            <b>{soles(aceptando.precioKg)} por kg</b> × {kilos(publicacion.kg)} kg = <b>{soles(aceptando.total)}</b>.
            Después coordinan la entrega.
          </p>
        )}
        <div className="note">
          <Icono nombre="i-info" />
          <span>
            Al aceptar, este comprador verá tu WhatsApp. Las demás ofertas pasan a “No seleccionada”. El pago lo
            acuerdan entre ustedes, fuera de RecicloMap.
          </span>
        </div>
        <button type="button" className="btn p" disabled={enviando} onClick={() => void aceptar()}>
          {enviando ? 'Aceptando…' : 'Sí, aceptar oferta'}
        </button>
        <button type="button" className="btn ghost" onClick={() => setAceptando(null)}>
          Volver
        </button>
      </Ventana>
      <DialogoCancelar
        publicacion={cancelando && publicacion ? publicacion : null}
        alCerrar={() => setCancelando(false)}
        alCancelar={() => {
          setCancelando(false);
          void refrescar();
        }}
      />
    </>
  );
}

export function OfertasRecibidasPagina() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="ofe">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
