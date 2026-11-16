'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, Kpi } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { FichaMaterial, kilos, PildoraOferta, soles } from '@/publicaciones/piezas';
import type { OfertaEnviada, OfertasEnviadas } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Filtro = keyof OfertasEnviadas['conteos'];
const PESTANAS: Array<[Filtro, string]> = [
  ['todas', 'Todas'],
  ['pendientes', 'Pendientes'],
  ['aceptadas', 'Aceptadas'],
  ['no-seleccionadas', 'No seleccionadas'],
  ['retiradas', 'Retiradas'],
];

function Contenido() {
  const aviso = useAviso();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [datos, setDatos] = useState<OfertasEnviadas | null>(null);
  const [retirando, setRetirando] = useState<OfertaEnviada | null>(null);

  const cargar = useCallback(async (elegido: Filtro) => {
    setDatos(await pedir<OfertasEnviadas>(`/negocio/ofertas?estado=${elegido}`));
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<OfertasEnviadas>(`/negocio/ofertas?estado=${filtro}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos(null));
    return () => {
      vigente = false;
    };
  }, [filtro]);

  const retirar = async () => {
    if (!retirando) return;
    try {
      await pedir(`/negocio/ofertas/${retirando.id}/retirar`, { cuerpo: {} });
      aviso('Oferta retirada');
      setRetirando(null);
      await cargar(filtro);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos retirar la oferta.');
    }
  };

  const ind = datos?.indicadores;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Ofertas"
        titulo="Ofertas que"
        resaltado="enviaste"
        descripcion="Sigue cada oferta hasta que el reciclador responda. Su contacto aparece solo cuando acepta."
        acciones={
          <Link className="btn p" href={RUTAS.publicacionesCercanas}>
            Buscar publicaciones
          </Link>
        }
      />
      <div className="grid4" style={{ marginBottom: 24 }}>
        <Kpi
          etiqueta="Enviadas"
          valor={ind?.enviadas ?? '—'}
          detalle="sin contar retiradas"
          icono="i-gift"
          fondo="sky"
        />
        <Kpi
          etiqueta="Pendientes"
          valor={ind?.pendientes ?? '—'}
          detalle="esperando respuesta"
          icono="i-clock"
          fondo="sand"
        />
        <Kpi etiqueta="Aceptadas" valor={ind?.aceptadas ?? '—'} detalle="a coordinar" icono="i-check" fondo="mint" />
        <Kpi
          etiqueta="Tasa de aceptación"
          valor={ind?.tasaAceptacion === null || !ind ? '—' : `${ind.tasaAceptacion} %`}
          detalle="de las respondidas"
          icono="i-activity"
          fondo="lilac"
        />
      </div>
      <section className="panel">
        <div className="seg" role="group" aria-label="Estado de las ofertas" style={{ marginBottom: 16 }}>
          {PESTANAS.map(([clave, texto]) => (
            <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
              {texto} {datos?.conteos[clave] ?? ''}
            </button>
          ))}
        </div>
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Material</th>
                <th>Peso</th>
                <th>Tu oferta</th>
                <th>Total</th>
                <th>Distancia</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos?.datos.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty" style={{ border: 0 }}>
                      <b>Nada por aquí</b>
                      <span className="mini">Cuando envíes ofertas aparecerán en esta lista.</span>
                    </div>
                  </td>
                </tr>
              )}
              {datos?.datos.map((oferta) => (
                <tr
                  key={oferta.id}
                  data-oferta={oferta.id}
                  style={oferta.estado === 'PENDIENTE' || oferta.estado === 'ACEPTADA' ? undefined : { opacity: 0.7 }}
                >
                  <td>
                    <span className="row g8">
                      <FichaMaterial codigo={oferta.publicacion.material.codigo} tamano={30} />
                      <b>{oferta.publicacion.material.nombre}</b>
                    </span>
                  </td>
                  <td className="mono">{kilos(oferta.publicacion.kg)} kg</td>
                  <td className="mono">{soles(oferta.precioKg)} / kg</td>
                  <td className="mono">{soles(oferta.total)}</td>
                  <td>
                    {oferta.publicacion.tramo ?? '—'} <span className="mini">(aprox.)</span>
                  </td>
                  <td>
                    <PildoraOferta estado={oferta.estado} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {oferta.estado === 'PENDIENTE' && (
                      <>
                        <Link className="btn sm" href={`${RUTAS.publicacionesCercanas}/${oferta.publicacion.id}`}>
                          Ver
                        </Link>{' '}
                        <button type="button" className="btn sm dn" onClick={() => setRetirando(oferta)}>
                          Retirar
                        </button>
                      </>
                    )}
                    {oferta.estado === 'ACEPTADA' && oferta.operacion && (
                      <Link className="btn sm p" href={`/operaciones/${oferta.operacion.id}`}>
                        Ver la oferta aceptada
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Ventana
        abierta={retirando !== null}
        alCerrar={() => setRetirando(null)}
        antetitulo="RETIRAR OFERTA"
        titulo="¿Retirar esta oferta?"
      >
        <p className="mini">
          Tu oferta dejará de estar disponible para el reciclador. Podrás volver a ofertar después.
        </p>
        <div className="row g8 wr">
          <button type="button" className="btn dn" onClick={() => void retirar()}>
            Sí, retirar
          </button>
          <button type="button" className="btn" onClick={() => setRetirando(null)}>
            Volver
          </button>
        </div>
      </Ventana>
    </>
  );
}

export function OfertasEnviadasPagina() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa="pubs">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
