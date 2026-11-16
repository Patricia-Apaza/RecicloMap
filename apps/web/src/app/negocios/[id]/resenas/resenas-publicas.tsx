'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import type { Resena, ResumenResenas } from '@/publicaciones/tipos';
import { DialogoReportar, TarjetaResena, TarjetaResumen } from '@/resenas/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { useSesion } from '@/sesion/sesion';

type Respuesta = { negocio: string; resumen: ResumenResenas; datos: Resena[] };

// Pantalla 17: reseñas públicas; aquí no se crean reseñas, solo tras una operación completada (C6)
export function ResenasPublicas({ id }: { id: string }) {
  const { usuario } = useSesion();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportando, setReportando] = useState<Resena | null>(null);
  const [reportadas, setReportadas] = useState<string[]>([]);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>(`/negocios/${id}/resenas`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(
        (causa: unknown) =>
          vigente && setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargar las reseñas.'),
      );
    return () => {
      vigente = false;
    };
  }, [id]);

  const puedeReportar = usuario !== null && usuario.rol !== 'ADMIN';
  return (
    <MarcoApp activa="mapa">
      {error && (
        <div className="note warn" role="alert">
          {error}
        </div>
      )}
      {!datos && !error && <span className="girando" aria-label="Cargando" />}
      {datos && (
        <>
          <EncabezadoPagina
            antetitulo="Reseñas"
            titulo="Lo que dicen de"
            resaltado={datos.negocio}
            descripcion="Solo pueden opinar los recicladores que completaron una operación con este negocio."
            acciones={
              <Link className="btn ghost" href={`/negocios/${id}`}>
                Volver a la ficha
              </Link>
            }
          />
          <div className="cols">
            <section className="list">
              {datos.datos.length === 0 && <EstadoVacio icono="i-star" titulo="Aún no tiene reseñas" />}
              {datos.datos.map((resena) => (
                <TarjetaResena
                  key={resena.id}
                  resena={resena}
                  tituloRespuesta={`Respuesta de ${datos.negocio}`}
                  acciones={
                    puedeReportar &&
                    (reportadas.includes(resena.id) ? (
                      <span className="mini">Reportada</span>
                    ) : (
                      <button type="button" className="btn sm ghost" onClick={() => setReportando(resena)}>
                        Reportar
                      </button>
                    ))
                  }
                />
              ))}
            </section>
            <aside className="stack">
              <TarjetaResumen resumen={datos.resumen} />
              <div className="note">
                <span>
                  Las reseñas se escriben desde el seguimiento de una operación completada, no desde esta página.
                </span>
              </div>
            </aside>
          </div>
        </>
      )}
      <DialogoReportar
        resena={reportando}
        alCerrar={() => setReportando(null)}
        alReportar={(resenaId) => {
          setReportadas((actuales) => [...actuales, resenaId]);
          setReportando(null);
        }}
      />
    </MarcoApp>
  );
}
