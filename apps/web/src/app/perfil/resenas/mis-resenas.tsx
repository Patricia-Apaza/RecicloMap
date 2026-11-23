'use client';

import { useEffect, useState } from 'react';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import type { Resena, ResumenResenas } from '@/publicaciones/tipos';
import { TarjetaResena, TarjetaResumen } from '@/resenas/piezas';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

// Es su dato: las ve el propio reciclador, los negocios verificados y el administrador (Ajuste 1)
function Contenido() {
  const [datos, setDatos] = useState<{ resumen: ResumenResenas; datos: Resena[] } | null>(null);
  useEffect(() => {
    let vigente = true;
    pedir<{ resumen: ResumenResenas; datos: Resena[] }>('/yo/resenas')
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(
        () =>
          vigente && setDatos({ resumen: { promedio: null, cantidad: 0, nuevo: true, distribucion: [] }, datos: [] }),
      );
    return () => {
      vigente = false;
    };
  }, []);
  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi perfil"
        titulo="Reseñas que"
        resaltado="recibí"
        descripcion="Lo que opinan los negocios después de cada operación completada."
      />
      <div className="cols">
        <section className="list">
          {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
          {datos?.datos.length === 0 && (
            <EstadoVacio
              icono="i-star"
              titulo="Aún no tienes reseñas"
              descripcion="Aparecen cuando completas operaciones."
            />
          )}
          {datos?.datos.map((resena) => (
            <TarjetaResena key={resena.id} resena={resena} tituloRespuesta="" />
          ))}
        </section>
        <aside className="stack">
          {datos && datos.resumen.distribucion.length > 0 && <TarjetaResumen resumen={datos.resumen} />}
          <div className="note">
            <Icono nombre="i-lock" />
            <span>
              Las ven tú, los centros y compradores verificados al evaluar tu publicación, y la administración. Nunca se
              muestran al público.
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}

export function MisResenas() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
