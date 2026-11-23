'use client';

import type { CodigoMaterial, Demanda } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { EtiquetaSemaforo, EtiquetaDestacadoPro } from '@/diseno/etiquetas';
import { Interruptor } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { olvidarFavoritos } from '@/favoritos/favoritos';
import { Calificacion, EstadoNegocio, iconoNegocio, tipoNegocio } from '@/mapa/piezas';
import type { EstadoApertura, Opcion, SemaforoCalculado } from '@/mapa/resultados';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { FONDO_MATERIAL, soles } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Negocio = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  vehiculo: string | null;
  esPro: boolean;
  distanciaKm: number | null;
  zona: string | null;
  calificacion: Opcion['calificacion'];
  estado: EstadoApertura;
  horario: {
    dias: Array<{ dia: number; abre: string; cierra: string }>;
    habitual: { abre: string; cierra: string } | null;
  };
  materiales: Array<{
    material: { codigo: CodigoMaterial; nombre: string };
    min: string;
    max: string;
    demanda: Demanda;
    semaforo: SemaforoCalculado;
  }>;
};
type Favorito =
  | { id: string; visible: true; alertas: { precio: boolean; avisos: boolean }; negocio: Negocio }
  | {
      id: string;
      visible: false;
      alertas: { precio: boolean; avisos: boolean };
      negocio: { id: string; nombre: string; tipo: 'CENTRO' | 'MOVIL' };
    };
type Respuesta = { radioKm: number; datos: Favorito[] };
type Filtro = 'todos' | 'CENTRO' | 'MOVIL';
type Orden = 'cerca' | 'calificacion' | 'nombre';

const horarioTexto = (n: Negocio) => {
  if (n.tipo === 'MOVIL') return n.zona ?? 'Zona no indicada';
  const hoy = ((new Date().getDay() + 6) % 7) + 1;
  const dia = n.horario.dias.find((d) => d.dia === hoy) ?? n.horario.dias[0];
  return dia ? `${dia.abre}–${dia.cierra}` : 'Sin horario';
};

function Tarjeta({
  favorito,
  alQuitar,
  alCambiarAlerta,
}: {
  favorito: Favorito;
  alQuitar: () => void;
  alCambiarAlerta: (campo: 'alertaPrecio' | 'alertaAvisos', valor: boolean) => void;
}) {
  const quitar = (
    <button
      type="button"
      className="ib"
      aria-label={`Quitar ${favorito.negocio.nombre} de favoritos`}
      onClick={alQuitar}
      style={{ color: '#A83226' }}
    >
      <Icono nombre="i-heart" />
    </button>
  );
  if (!favorito.visible) {
    return (
      <article className="panel stack" style={{ padding: 20, gap: 10, opacity: 0.8 }} data-favorito={favorito.id}>
        <div className="row sp" style={{ alignItems: 'flex-start' }}>
          <b style={{ font: '800 19px var(--head)' }}>{favorito.negocio.nombre}</b>
          {quitar}
        </div>
        <p className="mini" style={{ margin: 0 }}>
          No está disponible en el mapa por ahora. Te avisaremos si vuelve a mostrar sus precios.
        </p>
      </article>
    );
  }
  const n = favorito.negocio;
  return (
    <article
      className="panel"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
      data-favorito={favorito.id}
    >
      <div className="row sp" style={{ alignItems: 'flex-start' }}>
        <div className="row g16">
          <span className={n.tipo === 'CENTRO' ? 'ico' : 'ico s'} style={{ width: 50, height: 50 }} aria-hidden="true">
            <Icono nombre={iconoNegocio(n)} />
          </span>
          <div>
            <b style={{ font: '800 19px var(--head)' }}>
              {n.nombre} {n.esPro && <EtiquetaDestacadoPro />}
            </b>
            <div className="mini">
              {tipoNegocio(n)}
              {n.distanciaKm !== null && ` · ${n.distanciaKm.toFixed(1)} km`}
            </div>
          </div>
        </div>
        {quitar}
      </div>
      <div className="row sp wr g8">
        <EstadoNegocio estado={n.estado} />
        <Calificacion calificacion={n.calificacion} />
        <span className="mini">{horarioTexto(n)}</span>
      </div>
      <div className="list" style={{ gap: 6 }}>
        {n.materiales.slice(0, 3).map((m) => (
          <div
            key={m.material.codigo}
            className="row sp"
            style={{ padding: '5px 0', borderBottom: '1.5px solid var(--line)' }}
          >
            <span className="row g8">
              <span
                className="mi"
                style={{ width: 28, height: 28, borderRadius: 8, background: FONDO_MATERIAL[m.material.codigo] }}
              >
                <Icono nombre={ICONO_MATERIAL[m.material.codigo]} tamano="sm" />
              </span>
              <b style={{ fontSize: 13.5 }}>{m.material.nombre}</b>
            </span>
            <span className="row g8">
              <span className="mono" style={{ fontSize: 13 }}>
                {soles(m.min)}–{Number(m.max).toFixed(2)}
              </span>
              <EtiquetaSemaforo semaforo={m.semaforo.clave} corto />
            </span>
          </div>
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <Interruptor
          etiqueta="Avisarme si cambia un precio"
          marcado={favorito.alertas.precio}
          alCambiar={(v) => alCambiarAlerta('alertaPrecio', v)}
        />
        <Interruptor
          etiqueta="Avisarme de sus anuncios"
          marcado={favorito.alertas.avisos}
          alCambiar={(v) => alCambiarAlerta('alertaAvisos', v)}
        />
      </div>
      <div className="row g8">
        <Link className="btn p sm" href={`/negocios/${n.id}`} style={{ flex: 1 }}>
          Ver detalle
        </Link>
        <Link className="btn sm" href={`${RUTAS.calculadora}?material=${n.materiales[0]?.material.codigo ?? 'pet'}`}>
          <Icono nombre="i-calc" />
          Calcular
        </Link>
      </div>
    </article>
  );
}

// Pantalla 19: guardados del reciclador; las alertas de precio solo existen aquí, por favorito
function Contenido() {
  const aviso = useAviso();
  const { ubicacion } = useUbicacion();
  const cabeceras = useMemo(() => cabecerasDeUbicacion(ubicacion), [ubicacion]);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [orden, setOrden] = useState<Orden>('cerca');

  const cargar = useCallback(async () => {
    setDatos(await pedir<Respuesta>('/favoritos', { cabeceras }));
  }, [cabeceras]);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>('/favoritos', { cabeceras })
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos({ radioKm: 5, datos: [] }));
    return () => {
      vigente = false;
    };
  }, [cabeceras]);

  const quitar = async (id: string) => {
    try {
      await pedir(`/favoritos/${id}`, { metodo: 'DELETE' });
      olvidarFavoritos();
      aviso('Quitado de favoritos');
      await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos quitarlo.');
    }
  };

  const cambiarAlerta = async (id: string, campo: 'alertaPrecio' | 'alertaAvisos', valor: boolean) => {
    try {
      await pedir(`/favoritos/${id}/alertas`, { metodo: 'PATCH', cuerpo: { [campo]: valor } });
      aviso(valor ? 'Aviso activado' : 'Aviso desactivado');
      await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos cambiar el aviso.');
    }
  };

  const lista = (datos?.datos ?? [])
    .filter((f) => filtro === 'todos' || f.negocio.tipo === filtro)
    .sort((a, b) => {
      if (!a.visible || !b.visible) return Number(b.visible) - Number(a.visible);
      if (orden === 'nombre') return a.negocio.nombre.localeCompare(b.negocio.nombre);
      if (orden === 'calificacion')
        return (b.negocio.calificacion.promedio ?? 0) - (a.negocio.calificacion.promedio ?? 0);
      return (a.negocio.distanciaKm ?? 999) - (b.negocio.distanciaKm ?? 999);
    });
  const cuenta = (f: Filtro) => (datos?.datos ?? []).filter((x) => f === 'todos' || x.negocio.tipo === f).length;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Guardados"
        titulo="Tus"
        resaltado="favoritos"
        descripcion="Los centros y compradores que más usas, con su precio y horario al día."
        acciones={
          <Link className="btn p" href={RUTAS.mapa}>
            <Icono nombre="i-map" />
            Buscar en el mapa
          </Link>
        }
      />
      <div className="row sp wr" style={{ marginBottom: 22, gap: 14 }}>
        <div className="seg" role="group" aria-label="Tipo">
          {(
            [
              ['todos', 'Todos'],
              ['CENTRO', 'Centros de acopio'],
              ['MOVIL', 'Compradores móviles'],
            ] as Array<[Filtro, string]>
          ).map(([clave, texto]) => (
            <button key={clave} type="button" aria-pressed={filtro === clave} onClick={() => setFiltro(clave)}>
              {texto} {cuenta(clave)}
            </button>
          ))}
        </div>
        <div className="row g8">
          <label htmlFor="orden" className="mini">
            Ordenar por
          </label>
          <div className="inp" style={{ height: 42 }}>
            <select id="orden" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="cerca">Más cerca</option>
              <option value="calificacion">Mejor calificación</option>
              <option value="nombre">Nombre</option>
            </select>
          </div>
        </div>
      </div>
      <div className="cols">
        <section>
          {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
          {datos && lista.length === 0 && (
            <EstadoVacio
              icono="i-heart"
              titulo="Aún no tienes favoritos"
              descripcion="Toca «Guardar» en el detalle de un centro o comprador y aparecerá aquí."
              accion={
                <Link className="btn p" href={RUTAS.mapa}>
                  Explorar el mapa
                </Link>
              }
            />
          )}
          <div className="grid2" style={{ gap: 20 }}>
            {lista.map((favorito) => (
              <Tarjeta
                key={favorito.id}
                favorito={favorito}
                alQuitar={() => void quitar(favorito.id)}
                alCambiarAlerta={(campo, valor) => void cambiarAlerta(favorito.id, campo, valor)}
              />
            ))}
          </div>
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>Avisos de tus favoritos</h3>
            <p className="mini" style={{ margin: 0 }}>
              En cada favorito eliges si quieres que te avisemos cuando cambie un precio o publique un anuncio. Es la
              única forma de recibir alertas de precio. Los avisos llegan a tus{' '}
              <Link href={RUTAS.notificaciones} style={{ color: 'var(--deep)', fontWeight: 700 }}>
                notificaciones
              </Link>
              , nunca por WhatsApp.
            </p>
          </div>
          <div className="note">
            <Icono nombre="i-info" />
            <span>
              El semáforo compara entre todos los que compran ese material a {datos?.radioKm ?? 5} km de ti, no solo
              entre tus favoritos.
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}

export function Favoritos() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
