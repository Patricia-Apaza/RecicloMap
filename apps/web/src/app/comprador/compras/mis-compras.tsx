'use client';

import { type CodigoMaterial, type EstadoOferta, formatearFecha, formatearHace } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useCallback, useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { useAlLlegarAviso } from '@/notificaciones/en-vivo';
import { RUTAS } from '@/navegacion/rutas';
import { descargarCsv } from '@/operaciones/historial';
import { DialogoRecibi, PildoraOperacion } from '@/operaciones/piezas';
import { FichaMaterial, kilos, PildoraOferta, soles } from '@/publicaciones/piezas';
import type { FilaHistorial } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type OfertaCompra = {
  id: string;
  estado: EstadoOferta;
  precioKg: string;
  total: string;
  fecha: string;
  publicacionId: string;
  material: { codigo: CodigoMaterial; nombre: string };
  kg: number;
  tramo: string | null;
};
type Compras = {
  indicadores: { ofertasEsperando: number; enCurso: number; porConfirmar: number; completadasMes: number };
  ofertas: OfertaCompra[];
  operaciones: FilaHistorial[];
};
type Pestana = 'ofertas' | 'en-curso' | 'completadas';
const EN_CURSO = ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'];

// Pantalla 54: el comprador móvil sigue sus ofertas y confirma los kilos recibidos
function Contenido() {
  const aviso = useAviso();
  const [pestana, setPestana] = useState<Pestana>('en-curso');
  const [datos, setDatos] = useState<Compras | null>(null);
  const [recibiendo, setRecibiendo] = useState<FilaHistorial | null>(null);
  const [retirando, setRetirando] = useState<OfertaCompra | null>(null);

  const cargar = useCallback(async () => {
    setDatos(await pedir<Compras>('/negocio/compras'));
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<Compras>('/negocio/compras')
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos(null));
    return () => {
      vigente = false;
    };
  }, []);

  useAlLlegarAviso(useCallback(() => void cargar().catch(() => undefined), [cargar]));

  const retirar = async () => {
    if (!retirando) return;
    try {
      await pedir(`/negocio/ofertas/${retirando.id}/retirar`, { cuerpo: {} });
      aviso('Oferta retirada');
      setRetirando(null);
      await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos retirar la oferta.');
    }
  };

  const enCurso = datos?.operaciones.filter((o) => EN_CURSO.includes(o.estado)) ?? [];
  const completadas = datos?.operaciones.filter((o) => o.estado === 'COMPLETADA' || o.estado === 'CANCELADA') ?? [];
  const pendientes = datos?.ofertas ?? [];
  const ind = datos?.indicadores;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Comprador móvil"
        titulo="Mis"
        resaltado="compras"
        descripcion="Ofertas que enviaste y operaciones en curso. Los datos del reciclador se muestran solo cuando aceptó tu oferta."
        acciones={
          <button
            type="button"
            className="btn"
            onClick={() =>
              void descargarCsv('todas', null, 'mis-compras').catch(() => aviso('No pudimos descargar el archivo.'))
            }
          >
            <Icono nombre="i-down" />
            Descargar CSV
          </button>
        }
      />
      <div className="grid4" style={{ marginBottom: 20 }}>
        <Kpi etiqueta="Ofertas esperando" valor={ind?.ofertasEsperando ?? '—'} icono="i-gift" fondo="sky" />
        <Kpi etiqueta="En curso" valor={ind?.enCurso ?? '—'} icono="i-truck" fondo="sand" />
        <Kpi
          etiqueta="Por confirmar"
          valor={ind?.porConfirmar ?? '—'}
          detalle="ya entregadas"
          icono="i-clock"
          fondo="mint"
        />
        <Kpi
          etiqueta="Completadas"
          valor={ind?.completadasMes ?? '—'}
          detalle="este mes"
          icono="i-check"
          fondo="lilac"
        />
      </div>
      <div
        className="seg"
        role="group"
        aria-label="Mostrar"
        style={{ width: '100%', gridAutoColumns: '1fr', marginBottom: 16 }}
      >
        <button type="button" aria-pressed={pestana === 'ofertas'} onClick={() => setPestana('ofertas')}>
          Ofertas {pendientes.length}
        </button>
        <button type="button" aria-pressed={pestana === 'en-curso'} onClick={() => setPestana('en-curso')}>
          En curso {enCurso.length}
        </button>
        <button type="button" aria-pressed={pestana === 'completadas'} onClick={() => setPestana('completadas')}>
          Completadas {completadas.length}
        </button>
      </div>
      {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
      <div className="list">
        {pestana === 'ofertas' &&
          (pendientes.length === 0 ? (
            <EstadoVacio
              icono="i-gift"
              titulo="Sin ofertas esperando"
              accion={
                <Link className="btn sm p" href={RUTAS.publicacionesCercanas}>
                  Buscar publicaciones
                </Link>
              }
            />
          ) : (
            pendientes.map((o) => (
              <div key={o.id} className="panel" data-oferta={o.id} style={{ padding: 14 }}>
                <div className="row g16" style={{ alignItems: 'flex-start' }}>
                  <FichaMaterial codigo={o.material.codigo} tamano={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row sp wr" style={{ gap: 6 }}>
                      <b style={{ font: '700 16px var(--head)' }}>
                        {o.material.nombre} · {kilos(o.kg)} kg
                      </b>
                      <PildoraOferta estado={o.estado} />
                    </div>
                    <div className="mini">
                      {soles(o.precioKg)} / kg · total {soles(o.total)} · {o.tramo ?? '—'} (aprox.) ·{' '}
                      {formatearHace(o.fecha)}
                    </div>
                  </div>
                </div>
                {o.estado === 'PENDIENTE' && (
                  <div className="row g8 wr" style={{ marginTop: 10 }}>
                    <Link className="btn sm" href={`${RUTAS.publicacionesCercanas}/${o.publicacionId}`}>
                      Ver publicación
                    </Link>
                    <button type="button" className="btn sm dn" onClick={() => setRetirando(o)}>
                      Retirar
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}
        {pestana !== 'ofertas' &&
          (pestana === 'en-curso' ? enCurso : completadas).map((o) => (
            <div key={o.id} className="panel" data-operacion={o.id} style={{ padding: 14 }}>
              <div className="row g16" style={{ alignItems: 'flex-start' }}>
                <FichaMaterial codigo={o.material.codigo} tamano={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row sp wr" style={{ gap: 6 }}>
                    <b style={{ font: '700 16px var(--head)' }}>
                      {o.material.nombre} · {o.contraparte}
                    </b>
                    <PildoraOperacion estado={o.estado} enDisputa={o.enDisputa} />
                  </div>
                  <div className="mini">
                    {o.kgConfirmados ? `Kilos recibidos: ${kilos(o.kg)} kg` : `Publicado: ${kilos(o.kg)} kg`} ·{' '}
                    {soles(o.precioKg)} / kg
                    {o.estado !== 'CANCELADA' && ` · ${soles(o.total)}`} · {formatearFecha(o.fecha)}
                  </div>
                </div>
              </div>
              <div className="row g8 wr" style={{ marginTop: 10 }}>
                <Link className="btn sm" href={`/operaciones/${o.id}`}>
                  Ver seguimiento
                </Link>
                {o.estado === 'ENTREGADA' && !o.enDisputa && (
                  <button type="button" className="btn sm p" onClick={() => setRecibiendo(o)}>
                    Confirmar recepción
                  </button>
                )}
                {o.estado === 'COMPLETADA' && !o.calificada && (
                  <Link className="btn sm p" href={`/operaciones/${o.id}/calificar`}>
                    Calificar
                  </Link>
                )}
              </div>
            </div>
          ))}
        {datos && pestana !== 'ofertas' && (pestana === 'en-curso' ? enCurso : completadas).length === 0 && (
          <EstadoVacio icono="i-truck" titulo={pestana === 'en-curso' ? 'Nada en curso' : 'Aún no completas compras'} />
        )}
      </div>
      <DialogoRecibi
        operacion={
          recibiendo
            ? { id: recibiendo.id, material: recibiendo.material, kg: recibiendo.kg, precioKg: recibiendo.precioKg }
            : null
        }
        alCerrar={() => setRecibiendo(null)}
        alConfirmar={() => {
          setRecibiendo(null);
          void cargar();
        }}
      />
      <Ventana
        abierta={retirando !== null}
        alCerrar={() => setRetirando(null)}
        antetitulo="RETIRAR OFERTA"
        titulo="¿Retirar esta oferta?"
      >
        <p className="mini">Tu oferta dejará de estar disponible para el reciclador.</p>
        <button type="button" className="btn dn" onClick={() => void retirar()}>
          Sí, retirar
        </button>
        <button type="button" className="btn ghost" onClick={() => setRetirando(null)}>
          Volver
        </button>
      </Ventana>
    </>
  );
}

export function MisCompras() {
  return (
    <Protegida roles={['COMPRADOR_MOVIL', 'CENTRO']}>
      <MarcoApp activa="com">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
