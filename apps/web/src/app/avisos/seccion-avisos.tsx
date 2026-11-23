'use client';

import { formatearFecha, TEXTO_TIPO_AVISO, TIPOS_AVISO, type TipoAviso } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useEffect, useState } from 'react';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Aviso = {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string | null;
  vigenteHasta: string;
  negocio: { id: string; nombre: string; tipo: 'CENTRO' | 'MOVIL' };
};

// Sección «Avisos»: anuncios vigentes de los negocios verificados de la ciudad
function Contenido() {
  const [tipo, setTipo] = useState<TipoAviso | null>(null);
  const [datos, setDatos] = useState<{ total: number; datos: Aviso[] } | null>(null);
  useEffect(() => {
    let vigente = true;
    pedir<{ total: number; datos: Aviso[] }>(`/avisos${tipo ? `?tipo=${tipo}` : ''}`)
      .then((r) => vigente && setDatos(r))
      .catch(() => vigente && setDatos({ total: 0, datos: [] }));
    return () => {
      vigente = false;
    };
  }, [tipo]);
  return (
    <>
      <EncabezadoPagina
        antetitulo="Avisos"
        titulo="Lo que anuncian los"
        resaltado="negocios"
        descripcion="Horarios especiales, material que necesitan y jornadas de recepción. Son informativos: los precios están en cada ficha."
      />
      <div className="row wr g8" role="group" aria-label="Tipo de aviso" style={{ marginBottom: 16 }}>
        <button type="button" className="cp" aria-pressed={tipo === null} onClick={() => setTipo(null)}>
          Todos
        </button>
        {TIPOS_AVISO.map((t) => (
          <button key={t} type="button" className="cp" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            {TEXTO_TIPO_AVISO[t]}
          </button>
        ))}
      </div>
      <div className="list" style={{ maxWidth: 760 }}>
        {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
        {datos?.datos.length === 0 && <EstadoVacio icono="i-bell" titulo="No hay avisos vigentes" />}
        {datos?.datos.map((a) => (
          <div key={a.id} className="panel" data-aviso={a.id} style={{ padding: '14px 16px' }}>
            <div className="row sp wr">
              <span className="pill grey">{TEXTO_TIPO_AVISO[a.tipo]}</span>
              <span className="mini">Hasta el {formatearFecha(a.vigenteHasta)}</span>
            </div>
            <b style={{ font: '700 17px var(--head)', display: 'block', marginTop: 6 }}>{a.titulo}</b>
            {a.mensaje && <p style={{ margin: '4px 0' }}>{a.mensaje}</p>}
            <Link href={`/negocios/${a.negocio.id}`} style={{ color: 'var(--deep)', fontWeight: 700 }}>
              {a.negocio.nombre}
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}

export function SeccionAvisos() {
  return (
    <Protegida invitado roles={['RECICLADOR']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
