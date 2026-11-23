'use client';

import { type GrupoPublicacion, MOTIVOS_CANCELACION } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { diasTexto, FichaMaterial, kilos, PildoraPublicacion, soles } from '@/publicaciones/piezas';
import { copiarPublicacion, type ModoCopia } from '@/publicaciones/copiar';
import type { MisPublicaciones, Publicacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

const PESTANAS: Array<[GrupoPublicacion, string]> = [
  ['activas', 'Activas'],
  ['finalizadas', 'Finalizadas'],
  ['vencidas', 'Vencidas'],
  ['canceladas', 'Canceladas'],
];
const abierta = (p: Publicacion) => p.estado === 'DISPONIBLE' || p.estado === 'CON_OFERTAS';
const haceDias = (fecha: string) => Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000));

// Cancelar pide motivo; las ofertas pendientes se cierran y los negocios reciben el aviso
export function DialogoCancelar({
  publicacion,
  alCerrar,
  alCancelar,
}: {
  publicacion: Publicacion | null;
  alCerrar: () => void;
  alCancelar: () => void;
}) {
  const aviso = useAviso();
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(false);
  if (!publicacion) return null;
  const confirmar = async () => {
    if (!motivo) {
      setError(true);
      return;
    }
    try {
      await pedir(`/publicaciones/${publicacion.id}/cancelar`, { cuerpo: { motivo } });
      aviso('Publicación cancelada');
      alCancelar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos cancelar la publicación.');
    }
  };
  return (
    <Ventana
      abierta
      alCerrar={alCerrar}
      antetitulo="CANCELAR PUBLICACIÓN"
      titulo={`¿Cancelar ${publicacion.material.nombre} · ${kilos(publicacion.kg)} kg?`}
    >
      <p className="mini">
        {publicacion.ofertas.pendientes > 0
          ? 'Las ofertas pendientes se cerrarán y los compradores serán avisados.'
          : 'Dejará de verse para los compradores.'}
      </p>
      <div className={error ? 'field err' : 'field'}>
        <label htmlFor={`${id}-motivo`}>Motivo</label>
        <div className="inp">
          <select
            id={`${id}-motivo`}
            value={motivo}
            onChange={(evento) => {
              setMotivo(evento.target.value);
              setError(false);
            }}
          >
            <option value="">Elige un motivo</option>
            {MOTIVOS_CANCELACION.map((opcion) => (
              <option key={opcion}>{opcion}</option>
            ))}
          </select>
        </div>
        {error && (
          <span className="msg" role="alert">
            Elige un motivo
          </span>
        )}
      </div>
      <div className="row g8 wr">
        <button type="button" className="btn dn" onClick={() => void confirmar()}>
          Cancelar publicación
        </button>
        <button type="button" className="btn" onClick={alCerrar}>
          Volver
        </button>
      </div>
    </Ventana>
  );
}

function Fila({
  publicacion,
  alRenovar,
  alCancelar,
  alCopiar,
}: {
  publicacion: Publicacion;
  alRenovar: () => void;
  alCancelar: () => void;
  alCopiar: (modo: ModoCopia) => void;
}) {
  const p = publicacion;
  const dias = haceDias(p.creadaEn);
  return (
    <article
      className="row g16 wr"
      style={{
        border: '2px solid var(--ink)',
        borderRadius: 18,
        padding: '14px 16px',
        boxShadow: '3px 3px 0 var(--ink)',
      }}
      data-publicacion={p.id}
    >
      <FichaMaterial codigo={p.material.codigo} tamano={52} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div className="row g8 wr">
          <b style={{ font: '800 18px var(--head)', color: 'var(--ink)' }}>
            {p.material.nombre} · {kilos(p.kg)} kg
          </b>
          <PildoraPublicacion estado={p.estado} />
        </div>
        <div className="mini" style={{ marginTop: 3 }}>
          {p.precioEsperado ? `Pides ${soles(p.precioEsperado)} por kg` : 'Sin precio fijo'} · publicada{' '}
          {dias === 0 ? 'hoy' : `hace ${diasTexto(dias)}`}
          {p.estado === 'CANCELADA' && p.motivoCancelacion ? ` · ${p.motivoCancelacion}` : ''}
        </div>
        {abierta(p) && (
          <div className="row g8" style={{ marginTop: 8 }}>
            <span className="prog" style={{ width: 150, height: 10 }} aria-hidden="true">
              <i style={{ width: `${(p.diasRestantes / 7) * 100}%` }} />
            </span>
            <span className="mini">{diasTexto(p.diasRestantes)} de vigencia</span>
          </div>
        )}
      </div>
      <div className="row g8 wr">
        {abierta(p) && (
          <>
            {p.ofertas.pendientes > 0 && (
              <span className="pill warn">
                <i />
                {p.ofertas.pendientes} {p.ofertas.pendientes === 1 ? 'oferta nueva' : 'ofertas nuevas'}
              </span>
            )}
            <Link className="btn sm" href={`${RUTAS.misPublicaciones}/${p.id}`}>
              Detalle
            </Link>
            <Link className="btn p sm" href={`${RUTAS.ofertas}?publicacion=${p.id}`}>
              Ver ofertas
            </Link>
            <button type="button" className="btn sm" onClick={alRenovar}>
              Renovar
            </button>
            <button type="button" className="btn sm dn" onClick={alCancelar}>
              Cancelar
            </button>
          </>
        )}
        {p.estado === 'EN_NEGOCIACION' && (
          <>
            <Link className="btn sm" href={`${RUTAS.misPublicaciones}/${p.id}`}>
              Detalle
            </Link>
            {p.operacion && (
              <Link className="btn p sm" href={`/operaciones/${p.operacion.id}`}>
                Ver la oferta aceptada
              </Link>
            )}
          </>
        )}
        {p.estado === 'VENCIDA' && (
          <button type="button" className="btn p sm" onClick={() => alCopiar('volver-a-publicar')}>
            Volver a publicar
          </button>
        )}
        {(p.estado === 'FINALIZADA' || p.estado === 'CANCELADA') && (
          <button type="button" className="btn sm" onClick={() => alCopiar('duplicar')}>
            Duplicar
          </button>
        )}
      </div>
    </article>
  );
}

function Contenido() {
  const aviso = useAviso();
  const router = useRouter();
  const [grupo, setGrupo] = useState<GrupoPublicacion>('activas');
  const [datos, setDatos] = useState<MisPublicaciones | null>(null);
  const [error, setError] = useState(false);
  const [cancelando, setCancelando] = useState<Publicacion | null>(null);

  const cargar = useCallback(async (elegido: GrupoPublicacion) => {
    setDatos(await pedir<MisPublicaciones>(`/publicaciones?grupo=${elegido}`));
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<MisPublicaciones>(`/publicaciones?grupo=${grupo}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [grupo]);

  const accion = async (ruta: string, mensaje: string, nuevoGrupo: GrupoPublicacion = grupo) => {
    try {
      await pedir(ruta, { cuerpo: {} });
      aviso(mensaje);
      setGrupo(nuevoGrupo);
      await cargar(nuevoGrupo);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos completar la acción.');
    }
  };

  const copiar = async (publicacion: Publicacion, modo: ModoCopia) => {
    try {
      const resultado = await copiarPublicacion(publicacion, modo);
      if (resultado.tipo === 'sin-ubicacion') {
        aviso('Elige desde dónde publicas para volver a publicar tu material.');
        router.push(resultado.ruta);
        return;
      }
      aviso(modo === 'duplicar' ? 'Publicación duplicada: ya está disponible' : 'Publicada de nuevo por 7 días');
      setGrupo('activas');
      await cargar('activas');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos completar la acción.');
    }
  };

  const ind = datos?.indicadores;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Reciclador"
        titulo="Mis"
        resaltado="publicaciones"
        descripcion="Cada publicación vive 7 días. Renueva las que sigas teniendo."
        acciones={
          <Link className="btn p" href={RUTAS.publicar}>
            <Icono nombre="i-plus" />
            Publicar material
          </Link>
        }
      />
      {error && (
        <div className="note warn" role="alert">
          <Icono nombre="i-alert" />
          <span>No pudimos cargar tus publicaciones. Recarga la página.</span>
        </div>
      )}
      <div className="grid4" style={{ marginBottom: 24 }}>
        <Kpi
          etiqueta="Activas"
          valor={ind?.activas ?? '—'}
          detalle="visibles para los compradores"
          icono="i-recycle"
          fondo="sky"
        />
        <Kpi
          etiqueta="Ofertas"
          valor={ind?.ofertasSinResponder ?? '—'}
          detalle="sin responder"
          icono="i-gift"
          fondo="sand"
        />
        <Kpi
          etiqueta="Kg publicados"
          valor={ind ? kilos(ind.kgActivos) : '—'}
          detalle="en activas"
          icono="i-activity"
          fondo="mint"
        />
        <Kpi
          etiqueta="Por vencer"
          valor={ind?.porVencer ?? '—'}
          detalle="2 días o menos"
          icono="i-clock"
          fondo="lilac"
        />
      </div>
      <section className="panel">
        <div className="seg" role="group" aria-label="Estado de las publicaciones" style={{ marginBottom: 16 }}>
          {PESTANAS.map(([clave, texto]) => (
            <button key={clave} type="button" aria-pressed={grupo === clave} onClick={() => setGrupo(clave)}>
              {texto} {datos?.conteos[clave] ?? ''}
            </button>
          ))}
        </div>
        <div className="list">
          {!datos && !error && <span className="girando" role="status" aria-label="Cargando" />}
          {datos?.datos.length === 0 && (
            <EstadoVacio
              icono="i-recycle"
              titulo="Nada por aquí"
              descripcion="Cuando tengas publicaciones en este estado aparecerán en esta lista."
            />
          )}
          {datos?.datos.map((publicacion) => (
            <Fila
              key={publicacion.id}
              publicacion={publicacion}
              alRenovar={() =>
                void accion(`/publicaciones/${publicacion.id}/renovar`, 'Publicación renovada por 7 días')
              }
              alCancelar={() => setCancelando(publicacion)}
              alCopiar={(modo) => void copiar(publicacion, modo)}
            />
          ))}
        </div>
      </section>
      <DialogoCancelar
        key={cancelando?.id ?? 'ninguna'}
        publicacion={cancelando}
        alCerrar={() => setCancelando(null)}
        alCancelar={() => {
          setCancelando(null);
          void cargar(grupo);
        }}
      />
    </>
  );
}

export function MisPublicaciones() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pub">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
