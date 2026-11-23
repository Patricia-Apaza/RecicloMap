'use client';

import { CODIGOS_MATERIAL, type FiltrosMapa, METODOS_PAGO, NOMBRE_MATERIAL } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useCallback, useEffect, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso } from '@/diseno/avisos';
import { clases } from '@/diseno/clases';
import { Interruptor } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { FILTROS_INICIALES, useFiltrosMapa } from '@/mapa/filtros';
import { PedirUbicacion, TextoUbicacion } from '@/mapa/pedir-ubicacion';
import { iconoNegocio, SelectorRadio } from '@/mapa/piezas';
import { RUTA_DETALLE, TEXTO_PAGO, useResultados } from '@/mapa/resultados';
import { useUbicacion } from '@/mapa/ubicacion';
import { InvitacionRegistro } from '@/navegacion/invitacion-registro';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

type Guardada = { id: string; nombre: string; filtros: FiltrosMapa };
const TEXTO_TIPO = { todos: 'todos', centro: 'centros', movil: 'móviles' } as const;

function useBusquedasGuardadas(activo: boolean) {
  const [lista, setLista] = useState<Guardada[] | null>(null);
  const recargar = useCallback(async () => {
    const respuesta = await pedir<{ datos: Guardada[] }>('/busquedas');
    setLista(respuesta.datos);
  }, []);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    pedir<{ datos: Guardada[] }>('/busquedas')
      .then((respuesta) => vigente && setLista(respuesta.datos))
      .catch(() => vigente && setLista([]));
    return () => {
      vigente = false;
    };
  }, [activo]);
  return { lista: activo ? lista : null, recargar };
}

function Contenido() {
  const aviso = useAviso();
  const { usuario } = useSesion();
  const esReciclador = usuario?.rol === 'RECICLADOR';
  const { filtros, cambiar, reemplazar } = useFiltrosMapa();
  const { ubicacion } = useUbicacion();
  const { configuracion } = useConfiguracionPublica();
  const resultados = useResultados(filtros, ubicacion);
  const { lista: guardadas, recargar } = useBusquedasGuardadas(esReciclador);
  const [invitacion, setInvitacion] = useState<string | null>(null);
  const datos = resultados.datos;
  const vista = [...(datos?.opciones ?? [])].sort((a, b) => a.distanciaKm - b.distanciaKm).slice(0, 4);
  const diasAlDia = configuracion?.diasPrecioAlDia ?? 7;

  const guardar = async () => {
    if (!esReciclador) {
      setInvitacion('Para guardar búsquedas necesitas una cuenta de reciclador. Es gratis y toma un minuto.');
      return;
    }
    const nombre = `${NOMBRE_MATERIAL[filtros.material]} · ${TEXTO_TIPO[filtros.tipo]} · ${filtros.radio} km`;
    try {
      await pedir('/busquedas', { cuerpo: { nombre, filtros } });
      await recargar();
      aviso('Búsqueda guardada');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar la búsqueda.');
    }
  };

  const borrar = async (id: string) => {
    try {
      await pedir(`/busquedas/${id}`, { metodo: 'DELETE' });
      await recargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos borrar la búsqueda.');
    }
  };

  return (
    <MarcoApp activa="mapa">
      <div className="ph">
        <div>
          <span className="kick">Descubrir</span>
          <h1>
            Busca con los <u>filtros</u> que importan
          </h1>
          <p>Ajusta y mira al instante cuántos resultados quedan.</p>
        </div>
      </div>
      <div className="cols l">
        <form className="panel" onSubmit={(evento) => evento.preventDefault()} aria-label="Filtros">
          <h2>Filtros</h2>
          <div className="stack" style={{ gap: 20 }}>
            <div className="field">
              <span className="lbl">Material</span>
              <div className="mt" role="group" aria-label="Material">
                {CODIGOS_MATERIAL.map((codigo) => (
                  <button
                    key={codigo}
                    type="button"
                    aria-pressed={filtros.material === codigo}
                    onClick={() => cambiar({ material: codigo })}
                  >
                    <Icono nombre={ICONO_MATERIAL[codigo]} />
                    {NOMBRE_MATERIAL[codigo]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="lbl">Quién compra</span>
              <div className="seg" role="group" aria-label="Quién compra">
                {(['todos', 'centro', 'movil'] as const).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    aria-pressed={filtros.tipo === tipo}
                    onClick={() => cambiar({ tipo })}
                  >
                    {{ todos: 'Todos', centro: 'Centros', movil: 'Móviles' }[tipo]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="lbl">Distancia máxima</span>
              <SelectorRadio radio={filtros.radio} alCambiar={(radio) => cambiar({ radio })} />
            </div>
            <div className="field">
              <span className="lbl">Medios de pago</span>
              <div className="row wr g8" role="group" aria-label="Medios de pago">
                {METODOS_PAGO.map((metodo) => {
                  const marcado = filtros.pagos.includes(metodo);
                  return (
                    <button
                      key={metodo}
                      type="button"
                      className="cp"
                      aria-pressed={marcado}
                      onClick={() =>
                        cambiar({
                          pagos: marcado ? filtros.pagos.filter((p) => p !== metodo) : [...filtros.pagos, metodo],
                        })
                      }
                    >
                      {TEXTO_PAGO[metodo]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <span className="lbl">Demanda mínima</span>
              <div className="seg" role="group" aria-label="Demanda mínima">
                {(
                  [
                    [undefined, 'Cualquiera'],
                    ['MEDIA', 'Media o más'],
                    ['ALTA', 'Alta'],
                  ] as const
                ).map(([valor, texto]) => (
                  <button
                    key={texto}
                    type="button"
                    aria-pressed={filtros.demandaMinima === valor}
                    onClick={() => cambiar({ demandaMinima: valor })}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <Interruptor
                etiqueta="Solo abiertos o disponibles ahora"
                marcado={filtros.soloAbiertos}
                alCambiar={(soloAbiertos) => cambiar({ soloAbiertos })}
              />
              <Interruptor
                etiqueta={`Solo con precio al día (${diasAlDia} días o menos)`}
                marcado={filtros.soloAlDia}
                alCambiar={(soloAlDia) => cambiar({ soloAlDia })}
              />
            </div>
            <div className="row g8 wr">
              <button
                className="btn ghost"
                type="button"
                onClick={() => reemplazar({ ...FILTROS_INICIALES, material: filtros.material })}
              >
                Limpiar todo
              </button>
            </div>
          </div>
        </form>
        <section className="stack">
          {!ubicacion ? (
            <PedirUbicacion />
          ) : (
            <div className="panel" style={{ background: 'var(--mint)' }}>
              <div className="row sp wr">
                <div aria-live="polite">
                  <span className="kick">Resultados</span>
                  <div
                    style={{
                      font: '800 56px/1 var(--head)',
                      letterSpacing: '-.05em',
                      marginTop: 6,
                      color: 'var(--ink)',
                    }}
                  >
                    {datos ? datos.opciones.length : '…'}
                  </div>
                  <div className="mini" style={{ color: 'var(--ink)' }}>
                    {datos?.opciones.length === 1 ? 'comprador cumple tus filtros' : 'compradores cumplen tus filtros'}
                  </div>
                  <TextoUbicacion />
                </div>
                <div className="row g8 wr">
                  <button className="btn" type="button" onClick={() => void guardar()}>
                    Guardar esta búsqueda
                  </button>
                  <Link className="btn p" href={RUTAS.lista}>
                    Ver resultados
                  </Link>
                </div>
              </div>
            </div>
          )}
          {ubicacion && (
            <div className="panel">
              <h2>
                Vista previa <small>los 4 más cercanos</small>
              </h2>
              <div className="list" style={{ gap: 10 }}>
                {vista.length === 0 && datos && (
                  <div className="empty">
                    <b>Nadie cumple estos filtros</b>
                    <span className="mini">Prueba ampliando la distancia.</span>
                  </div>
                )}
                {vista.map((opcion) => (
                  <Link
                    key={opcion.id}
                    href={RUTA_DETALLE(opcion.id)}
                    className="row g16"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      border: '2px solid var(--ink)',
                      borderRadius: 14,
                      padding: '10px 14px',
                    }}
                  >
                    <span className={clases('ico', opcion.tipo === 'MOVIL' && 's')} style={{ width: 40, height: 40 }}>
                      <Icono nombre={iconoNegocio(opcion)} tamano="sm" />
                    </span>
                    <b style={{ flex: 1, font: '700 15px var(--head)', minWidth: 0 }}>{opcion.nombre}</b>
                    <span className="mini">~{Math.max(1, Math.round(opcion.distanciaKm))} km</span>
                    <span className="mono" style={{ fontWeight: 700 }}>
                      S/ {opcion.precio.min}–{opcion.precio.max}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="panel">
            <h3>Búsquedas guardadas</h3>
            <div className="list" style={{ gap: 8 }}>
              {!esReciclador ? (
                <p className="mini">Con una cuenta de reciclador puedes guardar hasta 5 búsquedas.</p>
              ) : guardadas && guardadas.length > 0 ? (
                guardadas.map((guardada) => (
                  <div key={guardada.id} className="row sp">
                    <button
                      type="button"
                      className="cp"
                      onClick={() => {
                        reemplazar(guardada.filtros);
                        aviso('Búsqueda aplicada');
                      }}
                    >
                      {guardada.nombre}
                    </button>
                    <button
                      type="button"
                      className="ib"
                      aria-label={`Borrar ${guardada.nombre}`}
                      style={{ width: 34, height: 34 }}
                      onClick={() => void borrar(guardada.id)}
                    >
                      <Icono nombre="i-close" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="mini">{guardadas ? 'Aún no guardaste ninguna búsqueda.' : 'Cargando…'}</p>
              )}
            </div>
          </div>
        </section>
      </div>
      <InvitacionRegistro motivo={invitacion} alCerrar={() => setInvitacion(null)} />
    </MarcoApp>
  );
}

export function BusquedaFiltros() {
  return (
    <Protegida invitado pasos={['LISTO', 'ESPERAR_VERIFICACION']}>
      <Contenido />
    </Protegida>
  );
}
