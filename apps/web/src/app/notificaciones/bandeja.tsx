'use client';

import { formatearHace } from '@reciclomap/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { useAlLlegarAviso } from '@/notificaciones/en-vivo';
import { PanelPreferencias } from '@/notificaciones/preferencias';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Tipo =
  | 'OFERTA'
  | 'ACEPTACION'
  | 'OPERACION'
  | 'DESAFIO'
  | 'GIRO'
  | 'PRECIO'
  | 'AVISO'
  | 'CONFIRMACION'
  | 'INSIGNIA'
  | 'NIVEL'
  | 'PLAN'
  | 'CUENTA';
type Notificacion = {
  id: string;
  tipo: Tipo;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  leidaEn: string | null;
  creadaEn: string;
};
type Filtro = 'todas' | 'sin-leer' | 'ofertas' | 'operaciones' | 'premios';

const ESTILO: Record<Tipo, [NombreIcono, string, string]> = {
  OFERTA: ['i-gift', 'var(--lime)', 'Oferta'],
  ACEPTACION: ['i-check', 'var(--mint)', 'Aceptación'],
  OPERACION: ['i-truck', 'var(--sky)', 'Operación'],
  DESAFIO: ['i-trophy', 'var(--sand)', 'Desafío'],
  GIRO: ['i-star', 'var(--lilac)', 'Giro'],
  PRECIO: ['i-cash', 'var(--sand)', 'Precio'],
  AVISO: ['i-bell', '#fff', 'Aviso'],
  CONFIRMACION: ['i-check', 'var(--mint)', 'Confirmación'],
  INSIGNIA: ['i-shield', 'var(--lilac)', 'Insignia'],
  NIVEL: ['i-trophy', 'var(--lime)', 'Progreso'],
  PLAN: ['i-star', 'var(--sand)', 'Plan'],
  CUENTA: ['i-shield', 'var(--sand)', 'Cuenta'],
};
const FILTROS: Array<[Filtro, string]> = [
  ['todas', 'Todas'],
  ['sin-leer', 'Sin leer'],
  ['ofertas', 'Ofertas'],
  ['operaciones', 'Operaciones'],
  ['premios', 'Premios'],
];

function Contenido() {
  const aviso = useAviso();
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const [version, setVersion] = useState(0);

  const cargar = useCallback(async (elegido: Filtro) => {
    setLista((await pedir<{ datos: Notificacion[] }>(`/notificaciones?filtro=${elegido}`)).datos);
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<{ datos: Notificacion[] }>(`/notificaciones?filtro=${filtro}`)
      .then((respuesta) => vigente && setLista(respuesta.datos))
      .catch(() => vigente && setLista([]));
    return () => {
      vigente = false;
    };
  }, [filtro, version]);

  useAlLlegarAviso(useCallback(() => setVersion((v) => v + 1), []));

  const abrir = async (notificacion: Notificacion) => {
    if (!notificacion.leidaEn)
      await pedir(`/notificaciones/${notificacion.id}/leer`, { cuerpo: {} }).catch(() => undefined);
    if (notificacion.enlace) router.push(notificacion.enlace);
    else await cargar(filtro);
  };

  const leerTodas = async () => {
    await pedir('/notificaciones/leer-todas', { cuerpo: {} });
    aviso('Todo marcado como leído');
    await cargar(filtro);
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Bandeja"
        titulo="Tus"
        resaltado="notificaciones"
        descripcion="Ofertas, avisos de operaciones, desafíos y premios. Las más recientes primero."
        acciones={
          <button type="button" className="btn" onClick={() => void leerTodas()}>
            <Icono nombre="i-check" />
            Marcar todo como leído
          </button>
        }
      />
      <div className="cols">
        <section className="stack">
          <div className="seg" role="group" aria-label="Mostrar" style={{ maxWidth: '100%', overflowX: 'auto' }}>
            {FILTROS.map(([clave, texto]) => (
              <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
                {texto}
              </button>
            ))}
          </div>
          <div className="list">
            {lista === null && <span className="girando" role="status" aria-label="Cargando" />}
            {lista?.length === 0 && (
              <EstadoVacio
                icono="i-bell"
                titulo={filtro === 'sin-leer' ? 'Estás al día' : 'No hay notificaciones aquí'}
                descripcion="Aquí verás las ofertas y los avisos de tus publicaciones y operaciones."
              />
            )}
            {lista?.map((n) => {
              const [icono, fondo, etiqueta] = ESTILO[n.tipo];
              return (
                <button
                  key={n.id}
                  type="button"
                  className="panel"
                  onClick={() => void abrir(n)}
                  data-notificacion={n.id}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: '14px 16px',
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                    boxShadow: n.leidaEn ? 'none' : '3px 3px 0 var(--ink)',
                    background: n.leidaEn ? '#fff' : '#F3FAE6',
                  }}
                >
                  <span className="ico" style={{ background: fondo }} aria-hidden="true">
                    <Icono nombre={icono} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="row sp wr" style={{ gap: 8 }}>
                      <b style={{ font: '700 15.5px var(--head)', color: 'var(--ink)' }}>{n.titulo}</b>
                      <span className="mini">{formatearHace(n.creadaEn)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 14, marginTop: 2 }}>{n.mensaje}</span>
                    <span className="mini">
                      {etiqueta}
                      {!n.leidaEn && ' · sin leer'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <PanelPreferencias />
      </div>
    </>
  );
}

export function Bandeja() {
  return (
    <Protegida pasos={['LISTO', 'ESPERAR_VERIFICACION']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
