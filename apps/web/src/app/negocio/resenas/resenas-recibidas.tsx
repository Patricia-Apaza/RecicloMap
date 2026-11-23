'use client';

import { esquemaRespuestaResena } from '@reciclomap/shared';
import { useCallback, useEffect, useId, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import type { Resena, ResumenResenas } from '@/publicaciones/tipos';
import { DialogoReportar, TarjetaResena, TarjetaResumen } from '@/resenas/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Filtro = 'todas' | 'sin-responder' | 'bajas';
type Respuesta = { resumen: ResumenResenas; datos: Resena[] };

function DialogoResponder({
  resena,
  alCerrar,
  alResponder,
}: {
  resena: Resena | null;
  alCerrar: () => void;
  alResponder: () => void;
}) {
  const aviso = useAviso();
  const id = useId();
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (!resena) return;
    const lectura = esquemaRespuestaResena.safeParse({ texto });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Escribe tu respuesta.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/resenas/${resena.id}/respuesta`, { cuerpo: lectura.data });
      aviso('Respuesta publicada');
      setTexto('');
      alResponder();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos publicar tu respuesta.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana
      abierta={resena !== null}
      alCerrar={alCerrar}
      antetitulo="RESPONDER RESEÑA"
      titulo={`Responder a ${resena?.autor ?? ''}`}
    >
      <p className="mini">Tu respuesta será pública y solo puedes responder una vez. Sé amable y concreto.</p>
      <div className={error ? 'field err' : 'field'}>
        <label htmlFor={id}>Tu respuesta</label>
        <div className="inp ta">
          <textarea
            id={id}
            rows={4}
            maxLength={300}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
          />
        </div>
        {error && (
          <span className="msg" role="alert">
            {error}
          </span>
        )}
      </div>
      <button type="button" className="btn p" disabled={enviando} onClick={() => void enviar()}>
        {enviando ? 'Publicando…' : 'Publicar respuesta'}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}

// Pantalla 48: el negocio responde una vez, en público, y puede reportar una reseña
function Contenido() {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [respondiendo, setRespondiendo] = useState<Resena | null>(null);
  const [reportando, setReportando] = useState<Resena | null>(null);

  const cargar = useCallback(async (elegido: Filtro) => {
    setDatos(await pedir<Respuesta>(`/mi-negocio/resenas?filtro=${elegido}`));
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>(`/mi-negocio/resenas?filtro=${filtro}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos(null));
    return () => {
      vigente = false;
    };
  }, [filtro]);

  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi negocio"
        titulo="Reseñas"
        resaltado="recibidas"
        descripcion="Lo que opinan los recicladores tras completar una operación. Tus respuestas son públicas."
      />
      <div className="cols">
        <section className="stack">
          <div className="seg" role="group" aria-label="Mostrar">
            {(
              [
                ['todas', 'Todas'],
                ['sin-responder', 'Sin responder'],
                ['bajas', '3 estrellas o menos'],
              ] as Array<[Filtro, string]>
            ).map(([clave, texto]) => (
              <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
                {texto}
              </button>
            ))}
          </div>
          {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
          <div className="list">
            {datos?.datos.length === 0 && <EstadoVacio icono="i-star" titulo="No hay reseñas aquí" />}
            {datos?.datos.map((resena) => (
              <TarjetaResena
                key={resena.id}
                resena={resena}
                tituloRespuesta="Tu respuesta"
                acciones={
                  <>
                    {!resena.respuesta && (
                      <button type="button" className="btn sm p" onClick={() => setRespondiendo(resena)}>
                        Responder
                      </button>
                    )}
                    {resena.reportadaPorMi ? (
                      <span className="mini">Reportada</span>
                    ) : (
                      <button type="button" className="btn sm ghost" onClick={() => setReportando(resena)}>
                        Reportar
                      </button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        </section>
        <aside className="stack">{datos && <TarjetaResumen resumen={datos.resumen} />}</aside>
      </div>
      <DialogoResponder
        resena={respondiendo}
        alCerrar={() => setRespondiendo(null)}
        alResponder={() => {
          setRespondiendo(null);
          void cargar(filtro);
        }}
      />
      <DialogoReportar
        resena={reportando}
        alCerrar={() => setReportando(null)}
        alReportar={() => {
          setReportando(null);
          void cargar(filtro);
        }}
      />
    </>
  );
}

export function ResenasRecibidas() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
