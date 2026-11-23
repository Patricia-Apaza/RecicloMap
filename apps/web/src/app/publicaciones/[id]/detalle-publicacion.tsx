'use client';

import '@/acceso/acceso.css';
import { esquemaEditarPublicacion, formatearFecha, LARGO_NOTA_PUBLICACION } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useCallback, useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, Kpi } from '@/diseno/bloques';
import { SelectorFotos } from '@/app/registro/_negocio/campos-negocio';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import {
  diasTexto,
  FichaMaterial,
  FotoPublicacion,
  kilos,
  PildoraPublicacion,
  soles,
  Vigencia,
} from '@/publicaciones/piezas';
import { copiarPublicacion, type ModoCopia } from '@/publicaciones/copiar';
import type { DetallePublicacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { DialogoCancelar } from '../mis-publicaciones';

function DialogoEditar({
  publicacion,
  alCerrar,
  alGuardar,
}: {
  publicacion: DetallePublicacion;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const aviso = useAviso();
  const [kg, setKg] = useState(String(publicacion.kg));
  const [precio, setPrecio] = useState(publicacion.precioEsperado ?? '');
  const [nota, setNota] = useState(publicacion.nota ?? '');
  const [fotos, setFotos] = useState<string[]>(publicacion.fotos);
  const [errores, setErrores] = useState<{ kg?: string; precioEsperado?: string }>({});
  const guardar = async () => {
    const lectura = esquemaEditarPublicacion.safeParse({ kg, precioEsperado: precio, nota, fotos });
    if (!lectura.success) {
      const encontrados: { kg?: string; precioEsperado?: string } = {};
      for (const problema of lectura.error.issues) {
        const campo = String(problema.path[0]) as 'kg' | 'precioEsperado';
        encontrados[campo] ??= problema.message;
      }
      setErrores(encontrados);
      return;
    }
    try {
      await pedir(`/publicaciones/${publicacion.id}`, { metodo: 'PUT', cuerpo: lectura.data });
      aviso('Publicación actualizada');
      alGuardar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar los cambios.');
    }
  };
  return (
    <Ventana abierta alCerrar={alCerrar} antetitulo="EDITAR PUBLICACIÓN" titulo="Cambiar peso, precio o fotos">
      <Campo
        etiqueta="Peso aproximado"
        sufijo="kg"
        inputMode="decimal"
        value={kg}
        onChange={(e) => setKg(e.target.value)}
        error={errores.kg}
      />
      <Campo
        etiqueta="Precio que pides"
        opcional
        prefijo="S/"
        sufijo="por kg"
        inputMode="decimal"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        error={errores.precioEsperado}
      />
      <div className="field">
        <label htmlFor="nota-edicion">
          Nota <span className="opt">(opcional)</span>
        </label>
        <div className="inp ta">
          <textarea
            id="nota-edicion"
            maxLength={LARGO_NOTA_PUBLICACION}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <span className="lbl">
          Fotos <span className="opt">(opcional)</span>
        </span>
        <SelectorFotos
          fotos={fotos}
          alCambiar={setFotos}
          proposito="PUBLICACION"
          etiquetas={['Foto 1', 'Foto 2', 'Foto 3']}
        />
      </div>
      <div className="row g8 wr">
        <button type="button" className="btn p" onClick={() => void guardar()}>
          Guardar
        </button>
        <button type="button" className="btn" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Ventana>
  );
}

function Contenido({ id }: { id: string }) {
  const aviso = useAviso();
  const [datos, setDatos] = useState<DetallePublicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(async () => {
    setDatos(await pedir<DetallePublicacion>(`/publicaciones/${id}`));
  }, [id]);

  useEffect(() => {
    let vigente = true;
    pedir<DetallePublicacion>(`/publicaciones/${id}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(
        (causa: unknown) => vigente && setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargarla.'),
      );
    return () => {
      vigente = false;
    };
  }, [id]);

  const accion = async (ruta: string, mensaje: string, irA?: (nueva: { id: string }) => string) => {
    try {
      const respuesta = await pedir<{ id: string }>(ruta, { cuerpo: {} });
      aviso(mensaje);
      if (irA) window.location.assign(irA(respuesta));
      else await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos completar la acción.');
    }
  };

  const copiar = async (modo: ModoCopia) => {
    if (!datos) return;
    try {
      const resultado = await copiarPublicacion(datos, modo);
      if (resultado.tipo === 'sin-ubicacion') {
        aviso('Elige desde dónde publicas para volver a publicar tu material.');
        window.location.assign(resultado.ruta);
        return;
      }
      aviso(modo === 'duplicar' ? 'Publicación duplicada' : 'Publicada de nuevo por 7 días');
      window.location.assign(`${RUTAS.misPublicaciones}/${resultado.id}`);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos completar la acción.');
    }
  };

  if (error) {
    return (
      <div className="note warn" role="alert">
        <Icono nombre="i-alert" />
        <span>
          {error} <Link href={RUTAS.misPublicaciones}>Volver a mis publicaciones</Link>
        </span>
      </div>
    );
  }
  if (!datos) return <span className="girando" role="status" aria-label="Cargando" />;
  const p = datos;
  const abierta = p.estado === 'DISPONIBLE' || p.estado === 'CON_OFERTAS';

  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi publicación"
        titulo={`${p.material.nombre} ·`}
        resaltado={`${kilos(p.kg)} kg`}
        descripcion="Esto es lo que ven los compradores. Puedes cambiar el peso o el precio mientras no tengas ofertas pendientes."
        acciones={
          <Link className="btn ghost" href={RUTAS.misPublicaciones}>
            <Icono nombre="i-arrow-left" />
            Mis publicaciones
          </Link>
        }
      />
      <div className="cols">
        <section className="stack">
          <div className="panel">
            <div className="row g16 wr">
              <FichaMaterial codigo={p.material.codigo} tamano={84} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <PildoraPublicacion estado={p.estado} />
                <div style={{ font: '800 28px var(--head)', marginTop: 6, color: 'var(--ink)' }}>
                  {p.precioEsperado ? (
                    <>
                      {soles(p.precioEsperado)} <small style={{ font: '500 14px var(--body)' }}>por kg que pides</small>
                    </>
                  ) : (
                    'Precio a convenir'
                  )}
                </div>
                <div className="mini">
                  Publicada el {formatearFecha(p.creadaEn)} · {kilos(p.kg)} kg aprox.
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
            {abierta && (
              <>
                <hr className="divl" />
                <Vigencia dias={p.diasRestantes} />
              </>
            )}
            <div className="grid3" style={{ marginTop: 16, gap: 12 }}>
              <Kpi etiqueta="Ofertas" valor={p.ofertas.total} />
              <Kpi etiqueta="Sin responder" valor={p.ofertas.pendientes} />
              <Kpi etiqueta="Mejor oferta" valor={p.ofertas.mejorPrecioKg ? soles(p.ofertas.mejorPrecioKg) : '—'} />
            </div>
          </div>
          <div className="panel">
            <h2>
              Historial <small>de esta publicación</small>
            </h2>
            <ol className="list" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
              {p.historial.map((evento) => (
                <li
                  key={`${evento.fecha}-${evento.texto}`}
                  className="row sp wr"
                  style={{ padding: '12px 0', borderBottom: '1.5px solid var(--line)' }}
                >
                  <span className="row g8">
                    <i
                      style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--btn)' }}
                      aria-hidden="true"
                    />
                    {evento.texto}
                  </span>
                  <span className="mini">
                    {evento.detalle} · {formatearFecha(evento.fecha)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>Acciones</h3>
            <div className="stack" style={{ gap: 10 }}>
              {p.estado === 'EN_NEGOCIACION' && p.operacion ? (
                <Link className="btn p" href={`/operaciones/${p.operacion.id}`}>
                  Ver la oferta aceptada
                </Link>
              ) : (
                <Link className="btn p" href={`${RUTAS.ofertas}?publicacion=${p.id}`}>
                  Ver ofertas ({p.ofertas.total})
                </Link>
              )}
              {abierta && (
                <>
                  <button type="button" className="btn" disabled={!p.editable} onClick={() => setEditando(true)}>
                    Editar peso, precio o fotos
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void accion(`/publicaciones/${p.id}/renovar`, 'Publicación renovada por 7 días')}
                  >
                    Renovar 7 días
                  </button>
                  <button type="button" className="btn dn" onClick={() => setCancelando(true)}>
                    Cancelar publicación
                  </button>
                </>
              )}
              {p.estado === 'VENCIDA' && (
                <button type="button" className="btn" onClick={() => void copiar('volver-a-publicar')}>
                  Volver a publicar
                </button>
              )}
              {(p.estado === 'FINALIZADA' || p.estado === 'CANCELADA') && (
                <button type="button" className="btn" onClick={() => void copiar('duplicar')}>
                  Duplicar
                </button>
              )}
            </div>
            {abierta && !p.editable && (
              <p className="mini" style={{ marginTop: 10 }}>
                No puedes editar mientras tengas ofertas pendientes. Respóndelas o cancela la publicación.
              </p>
            )}
            {p.estado === 'EN_NEGOCIACION' && (
              <p className="mini" style={{ marginTop: 10 }}>
                Ya aceptaste una oferta: esta publicación no se edita ni vence.
              </p>
            )}
          </div>
          <div className="panel">
            <h3>Cómo la ven los compradores</h3>
            <div
              className="row g16"
              style={{
                border: '2px solid var(--ink)',
                borderRadius: 16,
                padding: '12px 14px',
                boxShadow: '3px 3px 0 var(--ink)',
              }}
            >
              <FichaMaterial codigo={p.material.codigo} tamano={46} />
              <div style={{ flex: 1 }}>
                <b style={{ font: '700 16px var(--head)' }}>
                  {p.material.nombre} · {kilos(p.kg)} kg
                </b>
                <div className="mini">Juliaca · distancia aproximada</div>
              </div>
              <span className="mono" style={{ fontWeight: 700 }}>
                {p.precioEsperado ? soles(p.precioEsperado) : 'A convenir'}
              </span>
            </div>
            <p className="mini" style={{ marginTop: 10 }}>
              La pueden ver {p.loVeran} compradores y centros verificados de tu ciudad. Solo ven tu ciudad y una
              distancia aproximada; tu contacto se comparte cuando aceptas una oferta.
            </p>
            {abierta && <p className="mini">Vence en {diasTexto(p.diasRestantes)}.</p>}
          </div>
        </aside>
      </div>
      {editando && (
        <DialogoEditar
          publicacion={p}
          alCerrar={() => setEditando(false)}
          alGuardar={() => {
            setEditando(false);
            void cargar();
          }}
        />
      )}
      <DialogoCancelar
        publicacion={cancelando ? p : null}
        alCerrar={() => setCancelando(false)}
        alCancelar={() => {
          setCancelando(false);
          void cargar();
        }}
      />
    </>
  );
}

export function DetallePublicacionPropia({ id }: { id: string }) {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pub">
        <Contenido id={id} />
      </MarcoApp>
    </Protegida>
  );
}
