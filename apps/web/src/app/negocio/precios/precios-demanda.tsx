'use client';

import {
  type CodigoMaterial,
  CODIGOS_MATERIAL,
  formatearFecha,
  formatearHace,
  formatearRangoPrecio,
} from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Boton } from '@/diseno/boton';
import { EtiquetaDemanda, EtiquetaSemaforo } from '@/diseno/etiquetas';
import { Campo, Interruptor, Segmentado } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { type Punto, SelectorPin } from '@/mapa/selector-pin';
import type { SemaforoCalculado } from '@/mapa/resultados';
import {
  type Demanda,
  type FilaPrecio,
  errorDePrecios,
  preciosParaApi,
} from '@/app/registro/_negocio/formulario-negocio';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Moderacion = {
  estado: 'SOSPECHOSO' | 'CORRECCION_PEDIDA' | 'SUSPENDIDO';
  motivo: string | null;
  plazoHasta: string | null;
};
type PrecioPropio = {
  material: { codigo: CodigoMaterial; nombre: string };
  activo: boolean;
  min: string | null;
  max: string | null;
  demanda: Demanda;
  actualizadoEn: string | null;
  antiguo: boolean;
  semaforo: SemaforoCalculado | null;
  moderacion: Moderacion | null;
};
type MisPrecios = {
  tipo: 'CENTRO' | 'MOVIL';
  ubicacionConfirmada: boolean;
  diasPrecioAlDia: number;
  radioMercadoKm: number;
  materiales: PrecioPropio[];
};
type Cambio = { material: { codigo: CodigoMaterial; nombre: string }; min: string; max: string; cambiadoEn: string };
type Filas = Record<CodigoMaterial, FilaPrecio>;

const FONDO: Record<CodigoMaterial, string> = {
  pet: 'var(--sky)',
  carton: 'var(--sand)',
  papel: '#fff',
  plastico: 'var(--mint)',
  metal: 'var(--lilac)',
};
const DEMANDAS = [
  { valor: 'BAJA' as const, texto: 'Baja' },
  { valor: 'MEDIA' as const, texto: 'Media' },
  { valor: 'ALTA' as const, texto: 'Alta' },
];
const TEXTO_MODERACION: Record<Moderacion['estado'], string> = {
  SOSPECHOSO: 'Marcado para revisión por el equipo de RecicloMap.',
  CORRECCION_PEDIDA: 'El equipo de RecicloMap te pidió revisar este precio.',
  SUSPENDIDO: 'Suspendido: no se muestra en el mapa hasta que lo corrijas.',
};

const aFilas = (precios: PrecioPropio[]): Filas =>
  Object.fromEntries(
    precios.map((precio) => [
      precio.material.codigo,
      { activo: precio.activo, min: precio.min ?? '', max: precio.max ?? '', demanda: precio.demanda },
    ]),
  ) as Filas;

const rangoValido = (fila: FilaPrecio) => {
  const min = Number(fila.min.replace(',', '.'));
  const max = Number(fila.max.replace(',', '.'));
  return fila.min.trim() !== '' && fila.max.trim() !== '' && min > 0 && max >= min;
};

function PanelPin({ alColocar }: { alColocar: () => void }) {
  const aviso = useAviso();
  const [punto, setPunto] = useState<Punto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    if (!punto) return;
    setEnviando(true);
    try {
      await pedir('/mi-negocio/ubicacion', { metodo: 'PUT', cuerpo: { ubicacion: punto } });
      aviso('Pin guardado. Ya calculamos tu distancia exacta.');
      alColocar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el pin.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <section className="panel" aria-labelledby="titulo-pin" data-panel="pin">
      <h2 id="titulo-pin">Coloca el pin de tu local</h2>
      <p className="mini" style={{ marginBottom: 12 }}>
        Mientras no lo coloques, tu distancia se calcula desde el centro de tu zona. Con el pin, los recicladores ven la
        distancia real.
      </p>
      <SelectorPin valor={punto} centro={null} alCambiar={setPunto} />
      <div className="row" style={{ marginTop: 12 }}>
        <Boton variante="principal" disabled={!punto || enviando} onClick={() => void guardar()}>
          <Icono nombre="i-pin" />
          Guardar pin
        </Boton>
      </div>
    </section>
  );
}

function Contenido() {
  const aviso = useAviso();
  const [datos, setDatos] = useState<MisPrecios | null>(null);
  const [filas, setFilas] = useState<Filas | null>(null);
  const [historial, setHistorial] = useState<Cambio[] | null>(null);
  const [tocadas, setTocadas] = useState<Partial<Record<CodigoMaterial, boolean>>>({});
  const [sinGuardar, setSinGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    Promise.all([pedir<MisPrecios>('/mi-negocio/precios'), pedir<{ datos: Cambio[] }>('/mi-negocio/precios/historial')])
      .then(([respuesta, cambios]) => {
        if (!vigente) return;
        setDatos(respuesta);
        setFilas(aFilas(respuesta.materiales));
        setHistorial(cambios.datos);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [version]);

  if (error) {
    return (
      <div className="note warn" role="alert">
        <Icono nombre="i-alert" />
        <span>No pudimos cargar tus precios. Recarga la página para intentarlo de nuevo.</span>
      </div>
    );
  }
  if (!datos || !filas) return <span className="girando" role="status" aria-label="Cargando tus precios" />;

  const cambiar = (codigo: CodigoMaterial, cambio: Partial<FilaPrecio>) => {
    setFilas({ ...filas, [codigo]: { ...filas[codigo], ...cambio } });
    setSinGuardar(true);
  };

  const guardar = async () => {
    const activos = CODIGOS_MATERIAL.filter((codigo) => filas[codigo].activo);
    if (activos.length === 0) {
      aviso('Activa al menos un material');
      return;
    }
    const incompleto = activos.find((codigo) => !rangoValido(filas[codigo]));
    if (incompleto) {
      setTocadas(Object.fromEntries(activos.map((codigo) => [codigo, true])));
      aviso(
        `Falta el precio de ${datos.materiales.find((precio) => precio.material.codigo === incompleto)?.material.nombre ?? incompleto}. Es obligatorio.`,
      );
      return;
    }
    const problema = errorDePrecios(filas);
    if (problema) {
      aviso(problema);
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await pedir<MisPrecios>('/mi-negocio/precios', {
        metodo: 'PUT',
        cuerpo: { precios: preciosParaApi(filas) },
      });
      setDatos(respuesta);
      setFilas(aFilas(respuesta.materiales));
      setSinGuardar(false);
      setTocadas({});
      const cambios = await pedir<{ datos: Cambio[] }>('/mi-negocio/precios/historial');
      setHistorial(cambios.datos);
      aviso('Precios guardados. Actualizados hoy.');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tus precios.');
    } finally {
      setGuardando(false);
    }
  };

  const antiguos = datos.materiales.filter((precio) => precio.activo && precio.antiguo);
  const guardados = datos.materiales.filter((precio) => precio.activo);

  return (
    <>
      <EncabezadoPagina
        antetitulo="Materiales, precios y demanda"
        titulo="Tu precio"
        resaltado="lo decides tú"
        descripcion="Cada material tiene un rango de precio por kilo y un nivel de demanda. Los recicladores ven la fecha de actualización."
        acciones={
          <Boton variante="principal" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        }
      />
      {antiguos.length > 0 && (
        <div className="note warn" role="status" style={{ marginBottom: 20 }}>
          <Icono nombre="i-alert" />
          <span>
            {antiguos.map((precio) => precio.material.nombre).join(', ')}: actualizado hace más de{' '}
            {datos.diasPrecioAlDia} días. Los recicladores lo ven como «precio antiguo» hasta que lo actualices.
          </span>
        </div>
      )}
      <div className="cols">
        <div className="stack">
          {!datos.ubicacionConfirmada && <PanelPin alColocar={() => setVersion((valor) => valor + 1)} />}
          {datos.ubicacionConfirmada && datos.tipo === 'CENTRO' && (
            <div className="note" data-aviso="pin-fijo">
              <Icono nombre="i-pin" />
              <span>
                El pin de tu local ya está colocado y por ahora no se puede mover. Pronto podrás solicitar el cambio de
                dirección desde la app; mientras se revisa, seguirás visible con tu dirección actual.
              </span>
            </div>
          )}
          <section className="panel" aria-labelledby="titulo-compras">
            <h2 id="titulo-compras">
              Lo que compras <small>precio obligatorio por material activo</small>
            </h2>
            <div className="list">
              {datos.materiales.map((precio) => {
                const codigo = precio.material.codigo;
                const fila = filas[codigo];
                const malo = fila.activo && tocadas[codigo] === true && !rangoValido(fila);
                return (
                  <div
                    key={codigo}
                    data-material={codigo}
                    style={{
                      border: '2px solid var(--ink)',
                      borderRadius: 18,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      background: fila.activo ? '#fff' : 'var(--paper)',
                      boxShadow: fila.activo ? '3px 3px 0 var(--ink)' : 'none',
                    }}
                  >
                    <div className="row sp wr">
                      <div className="row g16">
                        <span className="mi" style={{ width: 44, height: 44, background: FONDO[codigo] }}>
                          <Icono nombre={ICONO_MATERIAL[codigo]} />
                        </span>
                        <div>
                          <b style={{ font: '800 18px var(--head)', color: 'var(--ink)' }}>{precio.material.nombre}</b>
                          <div className="mini">
                            {!precio.activo || !precio.actualizadoEn ? (
                              fila.activo ? (
                                'Nuevo: completa el rango'
                              ) : (
                                'No lo compras'
                              )
                            ) : precio.antiguo ? (
                              <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
                                Actualizado hace más de {datos.diasPrecioAlDia} días
                              </span>
                            ) : (
                              `Actualizado ${formatearHace(precio.actualizadoEn)}`
                            )}
                          </div>
                        </div>
                      </div>
                      <Interruptor
                        etiqueta="Lo compro"
                        marcado={fila.activo}
                        alCambiar={(activo) => cambiar(codigo, { activo })}
                      />
                    </div>
                    {precio.moderacion && (
                      <div className="note warn" role="status">
                        <Icono nombre="i-alert" />
                        <span>
                          <b>{TEXTO_MODERACION[precio.moderacion.estado]}</b>
                          {precio.moderacion.motivo && ` Motivo: ${precio.moderacion.motivo}.`}
                          {precio.moderacion.plazoHasta && ` Plazo: ${formatearFecha(precio.moderacion.plazoHasta)}.`}
                        </span>
                      </div>
                    )}
                    {fila.activo && (
                      <div
                        className="grid3"
                        style={{
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: 12,
                          alignItems: 'end',
                        }}
                      >
                        <Campo
                          etiqueta="Desde"
                          prefijo="S/"
                          sufijo="kg"
                          inputMode="decimal"
                          value={fila.min}
                          onChange={(evento) => cambiar(codigo, { min: evento.target.value })}
                          onBlur={() => setTocadas({ ...tocadas, [codigo]: true })}
                        />
                        <Campo
                          etiqueta="Hasta"
                          prefijo="S/"
                          sufijo="kg"
                          inputMode="decimal"
                          value={fila.max}
                          error={malo ? 'El “hasta” no puede ser menor que el “desde”.' : undefined}
                          onChange={(evento) => cambiar(codigo, { max: evento.target.value })}
                          onBlur={() => setTocadas({ ...tocadas, [codigo]: true })}
                        />
                        <div className="field">
                          <span className="lbl">Demanda</span>
                          <Segmentado
                            etiqueta={`Demanda de ${precio.material.nombre}`}
                            opciones={DEMANDAS}
                            valor={fila.demanda}
                            alCambiar={(demanda) => cambiar(codigo, { demanda })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <aside className="stack" style={{ position: 'sticky', top: 92 }}>
          <section className="panel" aria-labelledby="titulo-vista" data-panel="vista">
            <h3 id="titulo-vista" style={{ marginBottom: 2 }}>
              Así te verán
            </h3>
            <p className="mini" style={{ marginBottom: 10 }}>
              Guarda para ver cómo te comparan.
            </p>
            <div className="list" style={{ gap: 10 }}>
              {guardados.length === 0 && <p className="mini">Activa al menos un material y guarda.</p>}
              {guardados.map((precio) => (
                <div
                  key={precio.material.codigo}
                  className="row sp wr"
                  style={{ padding: '8px 0', borderBottom: '1.5px solid var(--line)' }}
                >
                  <div>
                    <b style={{ font: '700 14px var(--head)' }}>{precio.material.nombre}</b>
                    <div className="mono" style={{ font: '600 14px var(--mono)' }}>
                      {precio.min && precio.max ? formatearRangoPrecio(precio.min, precio.max) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {precio.moderacion?.estado === 'SUSPENDIDO' ? (
                      <span className="mini">No visible en el mapa</span>
                    ) : precio.semaforo ? (
                      <EtiquetaSemaforo semaforo={precio.semaforo.clave} />
                    ) : (
                      <span className="mini">Sin comparación</span>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <EtiquetaDemanda demanda={precio.demanda} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mini" style={{ marginTop: 10 }}>
              {sinGuardar
                ? 'Tienes cambios sin guardar: la vista se actualiza al guardar.'
                : `El semáforo compara tu precio con los demás negocios a ${datos.radioMercadoKm} km. La demanda es aparte.`}
            </p>
          </section>
          <div className="note">
            <Icono nombre="i-shield" />
            <span>
              Solo tú puedes cambiar tus precios. El administrador puede marcarlos como sospechosos, pero no editarlos.
            </span>
          </div>
          <section className="panel" aria-labelledby="titulo-historial" data-panel="historial">
            <h3 id="titulo-historial">Historial de cambios</h3>
            {historial && historial.length > 0 ? (
              <ul
                className="list"
                style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0, maxHeight: 280, overflow: 'auto' }}
              >
                {historial.map((cambio) => (
                  <li
                    key={`${cambio.material.codigo}-${cambio.cambiadoEn}`}
                    className="row sp wr"
                    style={{ fontSize: 13.5 }}
                  >
                    <span>
                      <b style={{ color: 'var(--ink)' }}>{cambio.material.nombre}</b> ·{' '}
                      <span className="mono">{formatearRangoPrecio(cambio.min, cambio.max)}</span>
                    </span>
                    <span className="mini">{formatearFecha(cambio.cambiadoEn)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mini">Aún no hay cambios registrados.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

export function PreciosDemanda() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa="pre">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
