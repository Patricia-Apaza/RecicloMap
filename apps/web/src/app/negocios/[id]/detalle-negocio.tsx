'use client';

import {
  type CodigoMaterial,
  type Demanda,
  enlaceWhatsApp,
  formatearFecha,
  formatearTelefono,
  TEXTO_TIPO_AVISO,
  type TipoAviso,
} from '@reciclomap/shared';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { registrarVisita } from '@/estadisticas/visita';
import { useAviso } from '@/diseno/avisos';
import { useFavoritos } from '@/favoritos/favoritos';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { clases } from '@/diseno/clases';
import { EtiquetaDemanda, EtiquetaSemaforo } from '@/diseno/etiquetas';
import { Icono } from '@/diseno/icono';
import { Contorno } from '@/acceso/marco-acceso';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { useFiltrosMapa } from '@/mapa/filtros';
import { MapaPunto } from '@/mapa/mapa-punto';
import { Calificacion, EstadoNegocio, iconoNegocio, tipoNegocio } from '@/mapa/piezas';
import { type EstadoApertura, hace, type Opcion, type SemaforoCalculado, TEXTO_PAGO } from '@/mapa/resultados';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { PantallaCargando, Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';
import s from './detalle.module.css';

type Detalle = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  vehiculo: string | null;
  esPro: boolean;
  descripcion: string | null;
  distanciaKm: number | null;
  radioKm: number;
  direccion: string | null;
  zona: string | null;
  posicion: { lat: number; lng: number };
  telefono: string | null;
  whatsapp: string;
  calificacion: Opcion['calificacion'];
  estado: EstadoApertura;
  horario: {
    dias: Array<{ dia: number; abre: string; cierra: string }>;
    habitual: { abre: string; cierra: string } | null;
  };
  pagos: string[];
  rutaDelDia: Array<{ zona: string; desde: string; hasta: string }>;
  fotos: string[];
  materiales: Array<{
    material: { codigo: CodigoMaterial; nombre: string };
    elegido: boolean;
    min: string;
    max: string;
    demanda: Demanda;
    actualizadoEn: string;
    antiguo: boolean;
    semaforo: SemaforoCalculado;
  }>;
};

type AvisoPublico = { id: string; tipo: TipoAviso; titulo: string; mensaje: string | null; vigenteHasta: string };
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const FONDO: Record<CodigoMaterial, string> = {
  pet: 'var(--sky)',
  carton: 'var(--sand)',
  papel: '#fff',
  plastico: 'var(--mint)',
  metal: 'var(--lilac)',
};
const ICONO_PAGO: Record<string, 'i-cash' | 'i-phone' | 'i-bank'> = {
  EFECTIVO: 'i-cash',
  YAPE: 'i-phone',
  PLIN: 'i-phone',
  TRANSFERENCIA: 'i-bank',
};

function diaDeHoy(): number {
  const corto = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short' }).format(new Date());
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(corto) + 1;
}

function Horario({ detalle }: { detalle: Detalle }) {
  const hoy = diaDeHoy();
  if (detalle.tipo === 'MOVIL') {
    return (
      <div className={s.horario}>
        <div>
          <span>Horario habitual</span>
          <span>
            {detalle.horario.habitual
              ? `${detalle.horario.habitual.abre} – ${detalle.horario.habitual.cierra}`
              : 'No indicado'}
          </span>
        </div>
        <div>
          <span>Días</span>
          <span>No indicado</span>
        </div>
        <p className="mini" style={{ margin: '6px 10px 0' }}>
          Si está disponible ahora lo indica su estado, no un horario.
        </p>
      </div>
    );
  }
  if (detalle.horario.dias.length === 0) return <p className="mini">No indicado</p>;
  return (
    <div className={s.horario}>
      {DIAS.map((nombre, indice) => {
        const dia = detalle.horario.dias.find((fila) => fila.dia === indice + 1);
        return (
          <div key={nombre} className={indice + 1 === hoy ? s.hoy : undefined}>
            <span>
              {nombre}
              {indice + 1 === hoy ? ' · hoy' : ''}
            </span>
            <span>{dia ? `${dia.abre} – ${dia.cierra}` : 'Cerrado'}</span>
          </div>
        );
      })}
    </div>
  );
}

// Acciones de la ficha: el invitado puede pedir cómo llegar y calcular; guardar y reportar exigen cuenta
function Acciones({ detalle, material }: { detalle: Detalle; material: CodigoMaterial }) {
  const aviso = useAviso();
  const { usuario } = useSesion();
  const { activo, ids, alternar } = useFavoritos();
  const guardado = ids.has(detalle.id);
  const guardar = async () => {
    if (!usuario) {
      aviso('Para guardar favoritos necesitas una cuenta. Es gratis.');
      return;
    }
    try {
      aviso((await alternar(detalle.id)) ? 'Guardado en tus favoritos' : 'Quitado de favoritos');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el favorito.');
    }
  };
  return (
    <div className="row g8 wr" data-acciones-negocio>
      <Link className="btn p" href={`${RUTAS.comoLlegar}?negocio=${detalle.id}&material=${material}`}>
        <Icono nombre="i-nav" />
        Cómo llegar
      </Link>
      {(activo || !usuario) && (
        <button type="button" className="btn" aria-pressed={guardado} onClick={() => void guardar()}>
          <Icono nombre="i-heart" />
          {guardado ? 'Guardado' : 'Guardar'}
        </button>
      )}
      <Link className="btn ghost" href={`${RUTAS.calculadora}?material=${material}`}>
        <Icono nombre="i-calc" />
        Calcular lo que vale mi material
      </Link>
    </div>
  );
}

function Contenido({ id }: { id: string }) {
  const { usuario } = useSesion();
  const { filtros } = useFiltrosMapa();
  const { ubicacion } = useUbicacion();
  const { configuracion } = useConfiguracionPublica();
  const [estado, setEstado] = useState<{ detalle: Detalle | null; error: string | null }>({
    detalle: null,
    error: null,
  });
  const consulta = `material=${filtros.material}&radio=${filtros.radio}`;
  const cabeceras = useMemo(() => cabecerasDeUbicacion(ubicacion), [ubicacion]);

  useEffect(() => {
    let vigente = true;
    pedir<Detalle>(`/compradores/${id}?${consulta}`, { cabeceras })
      .then((detalle) => {
        if (!vigente) return;
        setEstado({ detalle, error: null });
        document.title = `${detalle.nombre} · RecicloMap`;
      })
      .catch(
        (causa: unknown) =>
          vigente &&
          setEstado({
            detalle: null,
            error: causa instanceof ErrorApi ? causa.message : 'No pudimos cargar este negocio.',
          }),
      );
    return () => {
      vigente = false;
    };
  }, [id, consulta, cabeceras]);

  const detalle = estado.detalle;
  const [avisos, setAvisos] = useState<AvisoPublico[]>([]);
  const visitado = useRef<string | null>(null);
  useEffect(() => {
    if (!detalle || visitado.current === id) return;
    visitado.current = id;
    registrarVisita(id, filtros.material);
    let vigente = true;
    pedir<{ datos: AvisoPublico[] }>(`/compradores/${id}/avisos`)
      .then((r) => vigente && setAvisos(r.datos))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [detalle, id, filtros.material]);
  if (estado.error) {
    return (
      <MarcoApp activa="mapa">
        <div className="empty">
          <b>{estado.error}</b>
          <Link className="btn p sm" href={RUTAS.mapa}>
            Volver al mapa
          </Link>
        </div>
      </MarcoApp>
    );
  }
  if (!detalle) return <PantallaCargando />;
  const esCentro = detalle.tipo === 'CENTRO';
  const clave = configuracion?.googleMaps?.clave;

  return (
    <MarcoApp activa="mapa">
      <nav className={s.migas} aria-label="Ruta">
        <Link href={RUTAS.mapa}>
          <Icono nombre="i-arrow-left" tamano="sm" />
          Volver al mapa
        </Link>
        <span>
          / {esCentro ? 'Centros de acopio' : 'Compradores móviles'} / {detalle.nombre}
        </span>
      </nav>
      <section className={clases(s.portada, !esCentro && s.movil)}>
        <Contorno className={s.contorno} />
        <div className={s.izquierda}>
          <span className="kick">{tipoNegocio(detalle)} · verificado</span>
          <h1>
            {detalle.nombre}
            {detalle.esPro && <span className="pill pro">Pro</span>}
          </h1>
          <div className={s.meta}>
            <Calificacion calificacion={detalle.calificacion} />
            <Link href={`/negocios/${id}/resenas`} data-ver-resenas>
              Ver reseñas
            </Link>
            {detalle.distanciaKm !== null && (
              <span>
                <Icono nombre="i-pin" tamano="sm" /> a {detalle.distanciaKm.toFixed(1)} km de ti
              </span>
            )}
            <EstadoNegocio estado={detalle.estado} />
          </div>
          {detalle.descripcion && <p style={{ margin: 0, maxWidth: 520 }}>{detalle.descripcion}</p>}
          <Acciones detalle={detalle} material={filtros.material} />
        </div>
        <div className={s.derecha}>
          <div className={s.insignia}>
            {detalle.fotos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto pública servida por la API
              <img src={`/api/v1/fotos/${detalle.fotos[0]}?tamano=mini`} alt={`Foto de ${detalle.nombre}`} />
            ) : (
              <Icono nombre={iconoNegocio(detalle)} />
            )}
          </div>
        </div>
      </section>
      <div className="cols">
        <div className="stack" style={{ gap: 24 }}>
          <section className="panel">
            <h2>
              Qué compran y a cuánto <small>precio por kg · rango</small>
            </h2>
            <div className="note">
              <Icono nombre="i-info" />
              <span>
                El semáforo compara cada material entre quienes lo compran a {detalle.radioKm} km o menos. La demanda es
                aparte: un precio bajo puede tener demanda alta.
              </span>
            </div>
            <div className="row sp wr" style={{ gap: 8, margin: '10px 0' }}>
              <Link
                href={`${RUTAS.comparar}?ids=${detalle.id}`}
                className="mini"
                style={{ color: 'var(--deep)', fontWeight: 700 }}
              >
                Comparar con otros compradores
              </Link>
              {usuario?.rol === 'RECICLADOR' && (
                <Link
                  href={`${RUTAS.reportarInformacion}?negocio=${detalle.id}&material=${filtros.material}`}
                  className="mini"
                  style={{ color: 'var(--deep)', fontWeight: 700 }}
                  data-reportar
                >
                  ¿Algo no coincide? Reportar información
                </Link>
              )}
            </div>
            <div className={clases(s.fila, s.cabecera)} aria-hidden="true">
              <span>Material</span>
              <span>Precio</span>
              <span>Precio y demanda</span>
              <span>Precio al día</span>
            </div>
            {detalle.materiales.map((material) => (
              <div key={material.material.codigo} className={s.fila} data-material={material.material.codigo}>
                <div className={s.material}>
                  <span className="mi" style={{ background: FONDO[material.material.codigo] }}>
                    <Icono nombre={ICONO_MATERIAL[material.material.codigo]} />
                  </span>
                  {material.material.nombre}
                  {material.elegido && <span className="pill blue">Elegido</span>}
                </div>
                <div className={s.precio}>
                  S/ {material.min}–{material.max}
                  <small>por kg</small>
                </div>
                <div>
                  <EtiquetaSemaforo semaforo={material.semaforo.clave} />
                  <div style={{ marginTop: 6 }}>
                    <EtiquetaDemanda demanda={material.demanda} />
                  </div>
                </div>
                <div className={s.actualizado}>
                  Actualizado
                  <br />
                  <b style={{ color: material.antiguo ? 'var(--warn)' : 'var(--ink)' }}>
                    {hace(material.actualizadoEn)}
                    {material.antiguo ? ' · precio antiguo' : ''}
                  </b>
                </div>
              </div>
            ))}
          </section>
          {detalle.fotos.length > 0 && (
            <section className="panel">
              <h2>Fotos</h2>
              <div className={s.fotos}>
                {detalle.fotos.map((foto) => (
                  // eslint-disable-next-line @next/next/no-img-element -- foto pública servida por la API
                  <img
                    key={foto}
                    src={`/api/v1/fotos/${foto}?tamano=mini`}
                    alt={`Foto de ${detalle.nombre}`}
                    loading="lazy"
                  />
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h2>
              Antes de ir <small>consejos rápidos</small>
            </h2>
            <div className={s.contacto} style={{ marginTop: 14 }}>
              <div>
                <Icono nombre="i-check" />
                <span>Los precios son un rango por kg; el final depende del peso y la limpieza del material.</span>
              </div>
              <div>
                <Icono nombre="i-lock" />
                <span>
                  {esCentro ? 'Este negocio es público. ' : ''}
                  <b>Tu ubicación exacta no se comparte</b> hasta que aceptes una oferta.
                </span>
              </div>
            </div>
          </section>
        </div>
        <aside className={s.lado}>
          <section className="panel">
            <h3>{esCentro ? 'Ubicación' : 'Zona de trabajo'}</h3>
            {clave && (
              <div className={s.mapita}>
                <MapaPunto
                  clave={clave}
                  idMapa={configuracion?.googleMaps?.idMapa ?? 'DEMO_MAP_ID'}
                  punto={detalle.posicion}
                  etiqueta={detalle.nombre}
                />
              </div>
            )}
            <div className={s.contacto}>
              {esCentro ? (
                <div>
                  <Icono nombre="i-pin" />
                  <span>
                    <b>{detalle.direccion}</b>
                    {detalle.zona && (
                      <>
                        <br />
                        <span style={{ color: 'var(--muted)' }}>{detalle.zona}</span>
                      </>
                    )}
                  </span>
                </div>
              ) : (
                <div>
                  <Icono nombre="i-pin" />
                  <span>
                    <b>{detalle.zona ?? 'Zona no indicada'}</b>
                    <br />
                    <span style={{ color: 'var(--muted)' }}>Ubicación aproximada, nunca en tiempo real</span>
                  </span>
                </div>
              )}
              {detalle.telefono && (
                <div>
                  <Icono nombre="i-phone" />
                  <span>
                    <b>{formatearTelefono(detalle.telefono)}</b>
                    <br />
                    <span style={{ color: 'var(--muted)' }}>Teléfono del negocio</span>
                  </span>
                </div>
              )}
              <div>
                <Icono nombre="i-whatsapp" />
                <span>
                  <a
                    href={enlaceWhatsApp(detalle.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--ink)', fontWeight: 700 }}
                  >
                    WhatsApp {formatearTelefono(detalle.whatsapp)}
                  </a>
                  <br />
                  <span style={{ color: 'var(--muted)' }}>
                    {esCentro ? 'Canal principal para coordinar' : 'Escríbele para coordinar el recojo'}
                  </span>
                </span>
              </div>
            </div>
          </section>
          {avisos.length > 0 && (
            <section className="panel" data-avisos-negocio>
              <h3>Avisos del negocio</h3>
              <div className="list" style={{ gap: 10 }}>
                {avisos.map((a) => (
                  <div key={a.id} style={{ border: '2px solid var(--ink)', borderRadius: 14, padding: '10px 12px' }}>
                    <div className="row sp">
                      <span className="pill grey">{TEXTO_TIPO_AVISO[a.tipo]}</span>
                      <span className="mini">Hasta el {formatearFecha(a.vigenteHasta)}</span>
                    </div>
                    <b style={{ font: '700 15px var(--head)', display: 'block', marginTop: 4 }}>{a.titulo}</b>
                    {a.mensaje && <span className="mini">{a.mensaje}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {detalle.rutaDelDia.length > 0 && (
            <section className="panel" data-ruta-del-dia>
              <h3>Ruta de hoy</h3>
              <div className="list" style={{ gap: 6 }}>
                {detalle.rutaDelDia.map((p, i) => (
                  <div key={p.zona} className="row sp">
                    <span>
                      {i + 1}. {p.zona}
                    </span>
                    <b className="mono">
                      {p.desde}–{p.hasta}
                    </b>
                  </div>
                ))}
              </div>
              <p className="mini" style={{ marginTop: 8 }}>
                Horario aproximado. Escríbele por WhatsApp para confirmar dónde encontrarlo.
              </p>
            </section>
          )}
          <section className="panel">
            <h3>Horario</h3>
            <Horario detalle={detalle} />
          </section>
          <section className="panel">
            <h3>Métodos de pago</h3>
            {detalle.pagos.length > 0 ? (
              <div className={s.pagos}>
                {detalle.pagos.map((pago) => (
                  <span key={pago}>
                    <Icono nombre={ICONO_PAGO[pago] ?? 'i-cash'} tamano="sm" />
                    {TEXTO_PAGO[pago] ?? pago}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mini">No indicado</p>
            )}
          </section>
        </aside>
      </div>
    </MarcoApp>
  );
}

export function DetalleNegocio({ id }: { id: string }) {
  return (
    <Protegida invitado pasos={['LISTO', 'ESPERAR_VERIFICACION']}>
      <Contenido id={id} />
    </Protegida>
  );
}
