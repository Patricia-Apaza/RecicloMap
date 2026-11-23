'use client';

import { type CodigoMaterial, type Demanda, MAXIMO_COMPARAR } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { EtiquetaDemanda, EtiquetaSemaforo, EtiquetaDestacadoPro } from '@/diseno/etiquetas';
import { Icono } from '@/diseno/icono';
import { useFiltrosMapa } from '@/mapa/filtros';
import { Calificacion, EstadoNegocio, iconoNegocio } from '@/mapa/piezas';
import { type EstadoApertura, hace, type Opcion, type SemaforoCalculado, TEXTO_PAGO } from '@/mapa/resultados';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { soles } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Comparacion = {
  negocios: Array<{
    id: string;
    nombre: string;
    tipo: 'CENTRO' | 'MOVIL';
    vehiculo: string | null;
    esPro: boolean;
    distanciaKm: number | null;
    calificacion: Opcion['calificacion'];
    estado: EstadoApertura;
    horario: Array<{ dia: number; abre: string; cierra: string }>;
    pagos: string[];
  }>;
  materiales: Array<{
    material: { codigo: CodigoMaterial; nombre: string };
    precios: Record<
      string,
      {
        min: string;
        max: string;
        demanda: Demanda;
        actualizadoEn: string;
        antiguo: boolean;
        semaforo: SemaforoCalculado;
      }
    >;
  }>;
};

// Pantalla 20: hasta 3 lado a lado; el semáforo se calcula solo entre los elegidos
function Contenido() {
  const router = useRouter();
  const parametros = useSearchParams();
  const { filtros } = useFiltrosMapa();
  const { ubicacion } = useUbicacion();
  const cabeceras = useMemo(() => cabecerasDeUbicacion(ubicacion), [ubicacion]);
  const elegidos = useMemo(
    () => [...new Set((parametros.get('ids') ?? '').split(',').filter(Boolean))].slice(0, MAXIMO_COMPARAR),
    [parametros],
  );
  const [opciones, setOpciones] = useState<Array<{ id: string; nombre: string }>>([]);
  const [datos, setDatos] = useState<{ comparacion: Comparacion | null; error: string | null; clave: string }>({
    comparacion: null,
    error: null,
    clave: '',
  });
  const clave = elegidos.join(',');

  // Candidatos: quienes compran el material elegido en el mapa dentro de 20 km
  useEffect(() => {
    if (!ubicacion) return;
    let vigente = true;
    pedir<{ opciones: Opcion[] }>(`/compradores?material=${filtros.material}&radio=20&orden=cercania`, { cabeceras })
      .then((r) => vigente && setOpciones(r.opciones.map((o) => ({ id: o.id, nombre: o.nombre }))))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [filtros.material, cabeceras, ubicacion]);

  useEffect(() => {
    if (elegidos.length < 2) return;
    let vigente = true;
    pedir<Comparacion>(`/compradores/comparar?ids=${clave}`, { cabeceras })
      .then((comparacion) => vigente && setDatos({ comparacion, error: null, clave }))
      .catch(
        (causa: unknown) =>
          vigente &&
          setDatos({
            comparacion: null,
            error: causa instanceof ErrorApi ? causa.message : 'No pudimos comparar.',
            clave,
          }),
      );
    return () => {
      vigente = false;
    };
  }, [clave, elegidos.length, cabeceras]);

  const fijar = (lista: string[]) =>
    router.replace(`${RUTAS.comparar}?ids=${[...new Set(lista.filter(Boolean))].slice(0, MAXIMO_COMPARAR).join(',')}`);
  const comparacion = datos.clave === clave ? datos.comparacion : null;
  const nombres = new Map([...opciones, ...(comparacion?.negocios ?? [])].map((o) => [o.id, o.nombre]));
  const libres = (actual: string | undefined) => opciones.filter((o) => o.id === actual || !elegidos.includes(o.id));

  const mejor = <T,>(valores: T[], comparar: (a: T, b: T) => number) => {
    const orden = [...valores].sort(comparar);
    return (v: T) =>
      valores.length > 1 &&
      comparar(v, orden[0] as T) === 0 &&
      comparar(orden[0] as T, orden[orden.length - 1] as T) !== 0;
  };
  const negocios = comparacion?.negocios ?? [];
  const masCerca = mejor(
    negocios.map((n) => n.distanciaKm ?? Infinity),
    (a, b) => a - b,
  );
  const mejorNota = mejor(
    negocios.map((n) => (n.calificacion.nuevo ? 0 : (n.calificacion.promedio ?? 0))),
    (a, b) => b - a,
  );
  const celda = (resaltar: boolean) => ({
    padding: 12,
    ...(resaltar ? { background: '#F3FAE6', fontWeight: 700 } : {}),
  });

  return (
    <>
      <EncabezadoPagina
        antetitulo="Comparar"
        titulo="Elige al que"
        resaltado="mejor te conviene"
        descripcion="Pon hasta 3 compradores lado a lado. Resaltamos el mejor en cada fila."
        acciones={
          <>
            <Link className="btn" href={RUTAS.lista}>
              Ver lista
            </Link>
            <Link className="btn p" href={RUTAS.calculadora}>
              Calculadora
            </Link>
          </>
        }
      />
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="row g16 wr" style={{ alignItems: 'flex-end' }}>
          {Array.from({
            length: Math.min(
              MAXIMO_COMPARAR,
              Math.max(2, elegidos.length + (elegidos.length < MAXIMO_COMPARAR ? 1 : 0)),
            ),
          }).map((_, indice) => (
            <div key={indice} className="field" style={{ width: 260, maxWidth: '100%' }}>
              <label htmlFor={`comprador-${indice}`}>Comprador {indice + 1}</label>
              <div className="inp">
                <select
                  id={`comprador-${indice}`}
                  value={elegidos[indice] ?? ''}
                  onChange={(e) => {
                    const lista = [...elegidos];
                    lista[indice] = e.target.value;
                    fijar(lista);
                  }}
                >
                  <option value="">Elige un comprador</option>
                  {elegidos[indice] && !opciones.some((o) => o.id === elegidos[indice]) && (
                    <option value={elegidos[indice]}>{nombres.get(elegidos[indice]) ?? 'Elegido'}</option>
                  )}
                  {libres(elegidos[indice]).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {elegidos.length > 2 && (
            <button type="button" className="btn ghost" onClick={() => fijar(elegidos.slice(0, -1))}>
              Quitar el último
            </button>
          )}
        </div>
        {opciones.length === 0 && ubicacion && (
          <p className="mini" style={{ marginTop: 8 }}>
            Los candidatos son los que compran el material elegido en el mapa, a 20 km o menos.
          </p>
        )}
        {!ubicacion && (
          <p className="mini" style={{ marginTop: 8 }}>
            Elige tu zona o comparte tu ubicación en el <Link href={RUTAS.mapa}>mapa</Link> para ver candidatos
            cercanos.
          </p>
        )}
      </div>
      {elegidos.length < 2 && <EstadoVacio icono="i-search" titulo="Elige al menos 2 compradores" />}
      {datos.error && datos.clave === clave && (
        <div className="note warn" role="alert">
          {datos.error}
        </div>
      )}
      {comparacion && (
        <section className="panel" style={{ overflowX: 'auto', position: 'relative' }} data-comparacion>
          <table className="tbl" tabIndex={0} style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Dato</span>
                </th>
                {negocios.map((n) => (
                  <th
                    key={n.id}
                    style={{
                      font: '800 16px var(--head)',
                      textTransform: 'none',
                      letterSpacing: 0,
                      color: 'var(--ink)',
                    }}
                  >
                    <span className="row g8">
                      <Icono nombre={iconoNegocio(n)} />
                      {n.nombre}
                      {n.esPro && <EtiquetaDestacadoPro />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Distancia</th>
                {negocios.map((n) => (
                  <td key={n.id} style={celda(masCerca(n.distanciaKm ?? Infinity))}>
                    {n.distanciaKm === null ? '—' : `${n.distanciaKm.toFixed(1)} km`}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Calificación</th>
                {negocios.map((n) => (
                  <td key={n.id} style={celda(mejorNota(n.calificacion.nuevo ? 0 : (n.calificacion.promedio ?? 0)))}>
                    <Calificacion calificacion={n.calificacion} />
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Estado ahora</th>
                {negocios.map((n) => (
                  <td key={n.id} style={celda(false)}>
                    <EstadoNegocio estado={n.estado} />
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Pagos</th>
                {negocios.map((n) => (
                  <td key={n.id} style={celda(false)}>
                    {n.pagos.map((p) => TEXTO_PAGO[p] ?? p).join(', ') || '—'}
                  </td>
                ))}
              </tr>
              {comparacion.materiales.map((m) => (
                <tr key={m.material.codigo} data-fila-material={m.material.codigo}>
                  <th scope="row">
                    <span className="row g8">
                      <Icono nombre={ICONO_MATERIAL[m.material.codigo]} tamano="sm" />
                      {m.material.nombre}
                    </span>
                  </th>
                  {negocios.map((n) => {
                    const precio = m.precios[n.id];
                    return (
                      <td key={n.id} style={celda(precio?.semaforo.clave === 'MEJOR')}>
                        {precio ? (
                          <>
                            <div className="mono" style={{ fontWeight: 700 }}>
                              {soles(precio.min)}–{Number(precio.max).toFixed(2)}
                            </div>
                            <div className="row g8 wr" style={{ marginTop: 4 }}>
                              <EtiquetaSemaforo semaforo={precio.semaforo.clave} corto />
                              <EtiquetaDemanda demanda={precio.demanda} conTexto={false} />
                            </div>
                            <div className="mini">{hace(precio.actualizadoEn)}</div>
                          </>
                        ) : (
                          <span className="mini">No lo compra</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <span className="sr-only">Acciones</span>
                </th>
                {negocios.map((n) => (
                  <td key={n.id} style={celda(false)}>
                    <Link className="btn p sm" href={`/negocios/${n.id}`}>
                      Ver detalle
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      )}
      <div className="note" style={{ marginTop: 20 }}>
        <Icono nombre="i-info" />
        <span>
          El semáforo compara los que elegiste entre sí por material. En la lista y el mapa se compara con todos los
          resultados.
        </span>
      </div>
    </>
  );
}

export function Comparar() {
  return (
    <Protegida invitado roles={['RECICLADOR']}>
      <MarcoApp activa="mapa">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
