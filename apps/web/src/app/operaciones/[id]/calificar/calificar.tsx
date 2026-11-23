'use client';

import { ETIQUETAS_CALIFICACION } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { EstrellasEditables, Ficha } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { FichaMaterial, kilos, soles } from '@/publicaciones/piezas';
import type { Operacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { nombreCorto } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

// Pantalla 27: una calificación por operación; el texto dice quién verá la reseña
function Formulario({ o }: { o: Operacion }) {
  const aviso = useAviso();
  const router = useRouter();
  const { usuario } = useSesion();
  const reciclador = o.rol === 'RECICLADOR';
  const etiquetas = reciclador ? ETIQUETAS_CALIFICACION.NEGOCIO : ETIQUETAS_CALIFICACION.RECICLADOR;
  const [estrellas, setEstrellas] = useState(0);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (estrellas < 1) {
      setError('Elige de 1 a 5 estrellas.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/operaciones/${o.id}/calificacion`, { cuerpo: { estrellas, etiquetas: elegidas, comentario } });
      aviso('Gracias por calificar.');
      router.push(`/operaciones/${o.id}`);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar tu calificación.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Operación completada"
        titulo="¿Cómo te fue con"
        resaltado={`${o.contraparte.nombre}?`}
        descripcion={
          reciclador
            ? `Tu reseña será pública en la ficha de ${o.contraparte.nombre}, con tu nombre como «${usuario ? nombreCorto(usuario.nombre) : ''}». Ayuda a otros recicladores.`
            : 'Tu reseña la verán solo los centros y compradores, en el perfil del reciclador. Nunca se muestra en el mapa.'
        }
      />
      <div className="cols">
        <section className="stack">
          <div className="panel">
            <div className="row g16 wr">
              <FichaMaterial codigo={o.material.codigo} tamano={64} />
              <div style={{ flex: 1 }}>
                <b style={{ font: '800 22px var(--head)' }}>
                  {o.material.nombre} · {kilos(o.kgFinal ?? o.kg)} kg
                </b>
                <div className="mini">con {o.contraparte.nombre}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ font: '700 22px var(--mono)' }}>
                  {soles(o.montoFinal ?? o.total)}
                </div>
                <div className="mini">{soles(o.precioKg)} por kg</div>
              </div>
            </div>
          </div>
          <form className="panel stack" style={{ gap: 18 }} onSubmit={(e) => void enviar(e)} noValidate>
            <h2>Tu calificación</h2>
            <div className={error && estrellas < 1 ? 'field err' : 'field'}>
              <EstrellasEditables
                valor={estrellas}
                alCambiar={(valor) => {
                  setEstrellas(valor);
                  setError(null);
                }}
                etiqueta="Tu calificación"
              />
            </div>
            <div className="field">
              <span className="lbl">
                ¿Qué destacas? <span className="opt">(opcional)</span>
              </span>
              <div className="row wr g8" role="group" aria-label="Qué destacas">
                {etiquetas.map((etiqueta) => (
                  <Ficha
                    key={etiqueta.codigo}
                    presionada={elegidas.includes(etiqueta.codigo)}
                    alPresionar={() =>
                      setElegidas((actuales) =>
                        actuales.includes(etiqueta.codigo)
                          ? actuales.filter((c) => c !== etiqueta.codigo)
                          : [...actuales, etiqueta.codigo],
                      )
                    }
                  >
                    {etiqueta.nombre}
                  </Ficha>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="comentario">
                Comentario <span className="opt">(opcional)</span>
              </label>
              <div className="inp ta">
                <textarea
                  id="comentario"
                  rows={3}
                  maxLength={300}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <span className="msg" role="alert" style={{ display: 'flex' }}>
                {error}
              </span>
            )}
            <button className="btn p" type="submit" disabled={enviando} style={{ alignSelf: 'flex-start' }}>
              {enviando ? 'Enviando…' : 'Enviar calificación'}
            </button>
          </form>
        </section>
        <aside className="stack">
          {reciclador && o.puntos !== null && (
            <div className="panel dark">
              <span className="kick" style={{ color: 'var(--lime)' }}>
                Puntos ganados
              </span>
              <div style={{ font: '800 64px/1 var(--head)', margin: '8px 0' }}>+{o.puntos}</div>
              <p style={{ color: '#cfe6d6', margin: 0 }}>1 punto por kg reciclado.</p>
            </div>
          )}
          <div className="panel">
            <h3>Y ahora</h3>
            <div className="stack" style={{ gap: 10 }}>
              {reciclador ? (
                <>
                  <Link className="btn" href={RUTAS.publicar}>
                    Publicar otro material
                  </Link>
                  <Link className="btn ghost" href={RUTAS.historial}>
                    Ver mi historial
                  </Link>
                </>
              ) : (
                <Link className="btn" href={RUTAS.publicacionesCercanas}>
                  Ver publicaciones cercanas
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Contenido({ id }: { id: string }) {
  const [o, setO] = useState<Operacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    pedir<Operacion>(`/operaciones/${id}`)
      .then((respuesta) => vigente && setO(respuesta))
      .catch(
        (causa: unknown) => vigente && setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargarla.'),
      );
    return () => {
      vigente = false;
    };
  }, [id]);
  if (error)
    return (
      <div className="note warn" role="alert">
        {error}
      </div>
    );
  if (!o) return <span className="girando" role="status" aria-label="Cargando" />;
  if (!o.acciones.includes('calificar')) {
    return (
      <div className="empty" role="status">
        <span className="ico m" style={{ width: 60, height: 60 }}>
          <Icono nombre="i-check" tamano="lg" />
        </span>
        <b>{o.miCalificacion ? 'Ya calificaste esta operación' : 'Se califica cuando la operación se completa'}</b>
        <Link className="btn sm" href={`/operaciones/${o.id}`}>
          Ver el seguimiento
        </Link>
      </div>
    );
  }
  return <Formulario o={o} />;
}

export function Calificar({ id }: { id: string }) {
  const { usuario } = useSesion();
  return (
    <Protegida roles={['RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa={usuario?.rol === 'RECICLADOR' ? 'his' : 'pubs'}>
        <Contenido id={id} />
      </MarcoApp>
    </Protegida>
  );
}
