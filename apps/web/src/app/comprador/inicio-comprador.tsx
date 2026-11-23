'use client';

import {
  CODIGOS_MATERIAL,
  DISPONIBILIDADES,
  type Disponibilidad,
  formatearFechaHora,
  NOMBRE_MATERIAL,
  TEXTO_DISPONIBILIDAD,
} from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useEffect, useId, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, Kpi } from '@/diseno/bloques';
import { Interruptor } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { usePublicacionesCercanas } from '@/publicaciones/cercanas';
import { DialogoOferta } from '@/publicaciones/dialogo-oferta';
import { FichaMaterial, kilos, soles } from '@/publicaciones/piezas';
import type { CalificacionPublica, PublicacionCercana } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Inicio = {
  nombre: string;
  ciudadId: number;
  disponibilidad: Disponibilidad;
  mostrarZona: boolean;
  compartePosicion: boolean;
  zona: { id: number; nombre: string } | null;
  zonaCambiableDesde: string | null;
  indicadores: {
    comprasHoy: number;
    kgHoy: number;
    kgMes: number;
    ofertasEnviadas: number;
    ofertasAceptadas: number;
    calificacion: CalificacionPublica;
  };
};

const TONO: Record<Disponibilidad, string> = { DISPONIBLE: 'open', EN_RUTA: 'warn', FUERA_DE_SERVICIO: 'closed' };

function saludo(): string {
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }));
  return hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function Contenido() {
  const aviso = useAviso();
  const idZona = useId();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [zonas, setZonas] = useState<Array<{ id: number; nombre: string }>>([]);
  const [error, setError] = useState(false);
  const [ofertando, setOfertando] = useState<PublicacionCercana | null>(null);
  const { datos: cercanas, rangos, recargar } = usePublicacionesCercanas(null);

  useEffect(() => {
    let vigente = true;
    pedir<Inicio>('/comprador/inicio')
      .then(async (respuesta) => {
        if (!vigente) return;
        setInicio(respuesta);
        const lista = await pedir<{ datos: Array<{ id: number; nombre: string }> }>(
          `/ciudades/${respuesta.ciudadId}/zonas`,
        );
        if (vigente) setZonas(lista.datos);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, []);

  // Cada día se decide de nuevo: el servidor redondea la posición, guarda un solo punto y la borra al terminar el día
  const compartir = async (comparte: boolean) => {
    try {
      if (!comparte) {
        await pedir('/mi-negocio/posicion', { metodo: 'PUT', cuerpo: { comparte: false } });
      } else {
        const posicion = await new Promise<{ lat: number; lng: number }>((resolver, rechazar) => {
          if (!('geolocation' in navigator)) return rechazar(new Error('sin-gps'));
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolver({ lat: coords.latitude, lng: coords.longitude }),
            () => rechazar(new Error('denegado')),
            { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
          );
        });
        await pedir('/mi-negocio/posicion', { metodo: 'PUT', cuerpo: { comparte: true, posicion } });
      }
      setInicio((actual) => (actual ? { ...actual, compartePosicion: comparte } : actual));
      aviso(comparte ? 'Los recicladores ven tu posición aproximada hoy' : 'Dejaste de compartir tu posición');
    } catch (causa) {
      aviso(
        causa instanceof ErrorApi
          ? causa.message
          : 'No pudimos usar tu ubicación. Revisa el permiso del navegador y vuelve a intentarlo.',
      );
    }
  };

  const cambiar = async (
    cambio: { disponibilidad?: Disponibilidad; zonaId?: number; mostrarZona?: boolean },
    mensaje: string,
  ) => {
    try {
      setInicio(await pedir<Inicio>('/mi-negocio/estado-movil', { metodo: 'PUT', cuerpo: cambio }));
      aviso(mensaje);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.');
    }
  };

  if (error) {
    return (
      <div className="note warn" role="alert">
        <Icono nombre="i-alert" />
        <span>No pudimos cargar tu inicio. Recarga la página.</span>
      </div>
    );
  }
  if (!inicio) return <span className="girando" role="status" aria-label="Cargando" />;
  const ind = inicio.indicadores;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Comprador móvil"
        titulo={`${saludo()},`}
        resaltado={inicio.nombre}
        descripcion="Dile a los recicladores si estás disponible y mira qué material hay en tu ciudad."
        acciones={
          <span className="pill open">
            <i />
            Verificado
          </span>
        }
      />
      <div className="panel grid2" style={{ gap: 28, marginBottom: 24, background: 'var(--sand)' }}>
        <div>
          <span className="kick">Tu estado ahora</span>
          <div style={{ margin: '10px 0 14px' }} data-disponibilidad={inicio.disponibilidad}>
            <span
              className={`pill ${TONO[inicio.disponibilidad]}`}
              style={{ height: 36, fontSize: 16, padding: '0 16px' }}
            >
              <i style={{ width: 10, height: 10 }} />
              {TEXTO_DISPONIBILIDAD[inicio.disponibilidad]}
            </span>
          </div>
          <div className="seg" role="group" aria-label="Tu estado">
            {DISPONIBILIDADES.map((estado) => (
              <button
                key={estado}
                type="button"
                aria-pressed={inicio.disponibilidad === estado}
                onClick={() =>
                  void cambiar({ disponibilidad: estado }, `Estado actualizado: ${TEXTO_DISPONIBILIDAD[estado]}`)
                }
              >
                {TEXTO_DISPONIBILIDAD[estado]}
              </button>
            ))}
          </div>
          <p className="mini" style={{ marginTop: 12, color: 'var(--ink)' }}>
            Los recicladores ven este estado en el mapa y en tu ficha.
          </p>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor={idZona}>Zona de trabajo</label>
            <div className="inp">
              <select
                id={idZona}
                value={inicio.zona?.id ?? ''}
                disabled={Boolean(inicio.zonaCambiableDesde)}
                onChange={(evento) => {
                  const zona = zonas.find((z) => z.id === Number(evento.target.value));
                  if (zona) void cambiar({ zonaId: zona.id }, `Tu zona de trabajo ahora es ${zona.nombre}`);
                }}
              >
                {zonas.map((zona) => (
                  <option key={zona.id} value={zona.id}>
                    {zona.nombre}
                  </option>
                ))}
              </select>
            </div>
            <span className="hint">
              {inicio.zonaCambiableDesde
                ? `Podrás cambiarla de nuevo el ${formatearFechaHora(inicio.zonaCambiableDesde)}.`
                : 'Se puede cambiar una vez al día. Desde ella se calcula la distancia a cada publicación.'}
            </span>
          </div>
          <div style={{ background: '#fff', border: '2px solid var(--ink)', borderRadius: 14, padding: '12px 14px' }}>
            <Interruptor
              etiqueta="Mostrar mi zona aproximada en el mapa"
              marcado={inicio.mostrarZona}
              alCambiar={(mostrarZona) =>
                void cambiar(
                  { mostrarZona },
                  mostrarZona ? 'Los recicladores verán tu zona aproximada' : 'Tu zona dejó de mostrarse en el mapa',
                )
              }
            />
            <span className="mini">Nunca tu ubicación exacta ni en tiempo real.</span>
          </div>
          {inicio.disponibilidad === 'EN_RUTA' && (
            <div
              style={{ background: '#fff', border: '2px solid var(--ink)', borderRadius: 14, padding: '12px 14px' }}
              data-posicion-del-dia
            >
              <Interruptor
                etiqueta="Compartir mi posición aproximada hoy"
                marcado={inicio.compartePosicion}
                alCambiar={(valor) => void compartir(valor)}
              />
              <span className="mini">
                Opcional y solo por hoy: se redondea a unos 100 m, no se guarda historial y se apaga al terminar el día.
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="grid4" style={{ marginBottom: 24 }}>
        <Kpi
          etiqueta="Compras de hoy"
          valor={ind.comprasHoy}
          detalle={`${kilos(ind.kgHoy)} kg recogidos`}
          icono="i-truck"
          fondo="sky"
        />
        <Kpi
          etiqueta="Kg del mes"
          valor={kilos(ind.kgMes)}
          unidad="kg"
          detalle="compras completadas"
          icono="i-activity"
          fondo="sand"
        />
        <Kpi
          etiqueta="Ofertas enviadas"
          valor={ind.ofertasEnviadas}
          detalle={`${ind.ofertasAceptadas} ${ind.ofertasAceptadas === 1 ? 'aceptada' : 'aceptadas'}`}
          icono="i-gift"
          fondo="mint"
        />
        <Kpi
          etiqueta="Calificación"
          valor={ind.calificacion.nuevo ? 'Nuevo' : (ind.calificacion.promedio ?? '—')}
          detalle={`${ind.calificacion.cantidad} ${ind.calificacion.cantidad === 1 ? 'calificación' : 'calificaciones'}`}
          icono="i-star"
          fondo="lilac"
        />
      </div>
      <div className="cols">
        <section className="panel">
          <h2>
            Material cerca de tu zona <small>publicaciones de recicladores</small>
          </h2>
          <div className="list">
            {!cercanas && <span className="girando" role="status" aria-label="Cargando" />}
            {cercanas?.length === 0 && <p className="mini">No hay publicaciones abiertas por ahora. Te avisaremos.</p>}
            {cercanas?.slice(0, 3).map((p) => (
              <div
                key={p.id}
                className="row g16"
                style={{
                  border: '2px solid var(--ink)',
                  borderRadius: 16,
                  padding: '12px 14px',
                  boxShadow: '3px 3px 0 var(--ink)',
                }}
                data-cercana={p.id}
              >
                <FichaMaterial codigo={p.material.codigo} tamano={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ font: '800 18px var(--head)', color: 'var(--ink)' }}>
                    {p.material.nombre} · {kilos(p.kg)} kg
                  </b>
                  <div className="mini">
                    {p.reciclador.ciudad} · a {p.tramo ?? '—'}
                    {p.precioEsperado ? ` · espera ${soles(p.precioEsperado)}/kg` : ''}
                  </div>
                </div>
                {p.miOferta?.estado === 'PENDIENTE' ? (
                  <span className="pill open">Oferta enviada</span>
                ) : (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setOfertando(p)}
                    disabled={Boolean(p.miOferta && p.miOferta.estado !== 'RETIRADA')}
                  >
                    Ofertar
                  </button>
                )}
              </div>
            ))}
          </div>
          <Link className="btn p sm" href={RUTAS.publicacionesCercanas} style={{ marginTop: 14 }}>
            Ver todas y ofertar
            <Icono nombre="i-arrow-right" tamano="sm" />
          </Link>
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>Mis precios</h3>
            <div className="list" style={{ gap: 8 }}>
              {CODIGOS_MATERIAL.filter((codigo) => rangos[codigo]).map((codigo) => (
                <div
                  key={codigo}
                  className="row sp"
                  style={{ padding: '6px 0', borderBottom: '1.5px solid var(--line)' }}
                >
                  <span className="row g8">
                    <FichaMaterial codigo={codigo} tamano={30} />
                    <b style={{ font: '600 14px var(--head)' }}>{NOMBRE_MATERIAL[codigo]}</b>
                  </span>
                  <span className="mono" style={{ font: '600 13.5px var(--mono)' }}>
                    {soles(rangos[codigo]!.min)}–{rangos[codigo]!.max}
                  </span>
                </div>
              ))}
            </div>
            <Link className="btn sm" href={RUTAS.preciosDemanda} style={{ marginTop: 12 }}>
              Actualizar precios
            </Link>
          </div>
          <div className="note">
            <Icono nombre="i-lock" />
            <span>El reciclador no ve tu ubicación exacta. Tú no ves la suya: solo una distancia aproximada.</span>
          </div>
        </aside>
      </div>
      <DialogoOferta
        key={ofertando?.id ?? 'ninguna'}
        objetivo={ofertando ? { ...ofertando, miPrecio: rangos[ofertando.material.codigo] ?? null } : null}
        actual={ofertando?.miOferta ?? null}
        alCerrar={() => setOfertando(null)}
        alEnviar={() => {
          setOfertando(null);
          void recargar();
        }}
      />
    </>
  );
}

export function InicioComprador() {
  return (
    <Protegida roles={['COMPRADOR_MOVIL']}>
      <MarcoApp activa="ini">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
