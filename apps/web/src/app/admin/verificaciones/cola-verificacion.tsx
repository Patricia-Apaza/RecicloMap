'use client';

import {
  type CodigoMaterial,
  formatearHace,
  formatearTelefono,
  MOTIVOS_INFORMACION,
  MOTIVOS_RECHAZO,
} from '@reciclomap/shared';
import { useCallback, useEffect, useState } from 'react';
import { useFotoProtegida } from '@/acceso/fotos';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EstadoVacio, Nota } from '@/diseno/bloques';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { PantallaCargando, Protegida } from '@/sesion/protegida';
import { formatearHorario, type Horario, TEXTO_PAGO, TEXTO_VEHICULO } from './formato';

type Filtro = 'pendientes' | 'info-pedida' | 'resueltas';
type EstadoVerificacion = 'EN_REVISION' | 'INFO_PEDIDA' | 'APROBADO' | 'RECHAZADO';

type FilaCola = {
  id: string;
  tipo?: 'REGISTRO' | 'CAMBIO_DIRECCION';
  estado: EstadoVerificacion;
  motivo: string | null;
  creadaEn: string;
  comprador: { id: string; nombreComercial: string; tipo: 'CENTRO' | 'MOVIL' };
};

type Detalle = {
  id: string;
  tipo?: 'REGISTRO' | 'CAMBIO_DIRECCION';
  cambioDireccion?: {
    vigente: { direccion: string | null; zona: string | null; pin: { lat: number; lng: number } | null };
    propuesta: { direccion: string; zona: string | null; pin: { lat: number; lng: number } | null } | null;
  } | null;
  estado: EstadoVerificacion;
  motivo: string | null;
  mensaje: string | null;
  creadaEn: string;
  comprador: {
    tipo: 'CENTRO' | 'MOVIL';
    nombreComercial: string;
    descripcion: string | null;
    direccion: string | null;
    zona: { nombre: string } | null;
    whatsapp: string;
    telefonoNegocio: string | null;
    vehiculo: string | null;
    horarios: Horario[];
    horaInicio: string | null;
    horaFin: string | null;
    pagos: string[];
    fotos: string[];
    precios: Array<{ material: { codigo: CodigoMaterial; nombre: string }; min: string; max: string; demanda: string }>;
  };
};

const FILTROS: Array<[Filtro, string]> = [
  ['pendientes', 'Pendientes'],
  ['info-pedida', 'Info pedida'],
  ['resueltas', 'Resueltas'],
];

const PILDORA: Record<EstadoVerificacion, { clase: string; texto: string }> = {
  EN_REVISION: { clase: 'warn', texto: 'Pendiente' },
  INFO_PEDIDA: { clase: 'blue', texto: 'Info pedida' },
  APROBADO: { clase: 'open', texto: 'Aprobado' },
  RECHAZADO: { clase: 'closed', texto: 'Rechazado' },
};

const FONDO_MATERIAL: Record<CodigoMaterial, string> = {
  pet: 'var(--sky)',
  carton: 'var(--sand)',
  papel: '#fff',
  plastico: 'var(--mint)',
  metal: 'var(--lilac)',
};

const DEMANDA: Record<string, string> = { ALTA: 'Demanda alta', MEDIA: 'Demanda media', BAJA: 'Demanda baja' };

function Pildora({ estado }: { estado: EstadoVerificacion }) {
  const pildora = PILDORA[estado];
  return (
    <span className={clases('pill', pildora.clase)}>
      <i />
      {pildora.texto}
    </span>
  );
}

function Miniatura({ id, alAbrir }: { id: string; alAbrir: (url: string) => void }) {
  const url = useFotoProtegida(id, 'mini');
  return (
    <button
      type="button"
      className="ico m"
      style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', padding: 0, cursor: 'pointer' }}
      aria-label="Ver foto en grande"
      onClick={() => url && alAbrir(id)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto privada servida desde memoria
        <img src={url} alt="Foto del negocio" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span className="girando" aria-hidden="true" />
      )}
    </button>
  );
}

function FotoGrande({ id, alCerrar }: { id: string | null; alCerrar: () => void }) {
  const url = useFotoProtegida(id, 'completa');
  return (
    <Ventana abierta={id !== null} alCerrar={alCerrar} titulo="Foto del negocio">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto privada servida desde memoria
        <img
          src={url}
          alt="Foto del negocio en tamaño completo"
          style={{ width: '100%', borderRadius: 14, border: '2px solid var(--ink)' }}
        />
      ) : (
        <PantallaCargando />
      )}
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Cerrar
      </button>
    </Ventana>
  );
}

type Modo = 'rechazar' | 'pedir-informacion';

function VentanaDecision({
  modo,
  negocio,
  alCerrar,
  alConfirmar,
}: {
  modo: Modo | null;
  negocio: string;
  alCerrar: () => void;
  alConfirmar: (motivo: string, mensaje: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<{ motivo?: boolean; mensaje?: boolean }>({});
  const [enviando, setEnviando] = useState(false);
  const motivos = modo === 'rechazar' ? MOTIVOS_RECHAZO : MOTIVOS_INFORMACION;

  const confirmar = async () => {
    const nuevos = { motivo: !motivo, mensaje: mensaje.trim().length < 5 };
    setErrores(nuevos);
    if (nuevos.motivo || nuevos.mensaje) return;
    setEnviando(true);
    try {
      await alConfirmar(motivo, mensaje.trim());
      setMotivo('');
      setMensaje('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana
      abierta={modo !== null}
      alCerrar={alCerrar}
      antetitulo={modo === 'rechazar' ? 'RECHAZAR' : 'PEDIR INFORMACIÓN'}
      titulo={`${modo === 'rechazar' ? 'Rechazar a' : 'Pedir información a'} ${negocio}`}
    >
      <div className={clases('field', errores.motivo && 'err')}>
        <label htmlFor="motivo-decision">
          Motivo <span className="opt">(obligatorio, se registra)</span>
        </label>
        <div className="inp">
          <select id="motivo-decision" value={motivo} onChange={(evento) => setMotivo(evento.target.value)}>
            <option value="">Elige un motivo</option>
            {motivos.map((opcion) => (
              <option key={opcion}>{opcion}</option>
            ))}
          </select>
        </div>
        <span className="msg">Elige un motivo.</span>
      </div>
      <div className={clases('field', errores.mensaje && 'err')}>
        <label htmlFor="mensaje-decision">Mensaje para la persona</label>
        <div className="inp ta">
          <textarea
            id="mensaje-decision"
            maxLength={140}
            style={{ height: 70 }}
            placeholder="Explica qué debe corregir."
            value={mensaje}
            onChange={(evento) => setMensaje(evento.target.value)}
          />
        </div>
        <span className="msg">Escribe un mensaje breve.</span>
        <span className="hint">Le llegará en la app y un aviso por SMS.</span>
      </div>
      <button
        type="button"
        className={clases('btn', modo === 'rechazar' ? 'dn' : 'p')}
        disabled={enviando}
        onClick={() => void confirmar()}
      >
        Confirmar
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}

function FichaNegocio({ detalle, alDecidir }: { detalle: Detalle; alDecidir: (accion: 'aprobar' | Modo) => void }) {
  const [fotoAbierta, setFotoAbierta] = useState<string | null>(null);
  const { comprador } = detalle;
  const esCentro = comprador.tipo === 'CENTRO';
  const pendiente = detalle.estado === 'EN_REVISION' || detalle.estado === 'INFO_PEDIDA';
  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="row sp" style={{ gap: 12 }}>
        <span>{etiqueta}</span>
        <b style={{ textAlign: 'right', color: 'var(--ink)' }}>{valor}</b>
      </div>
    ) : null;

  return (
    <>
      <div className="panel">
        <div className="row sp wr" style={{ gap: 12 }}>
          <div className="row g16">
            <span className={clases('ico', !esCentro && 's')} style={{ width: 56, height: 56 }}>
              <Icono nombre={esCentro ? 'i-store' : 'i-truck'} tamano="lg" />
            </span>
            <div>
              <h2 style={{ margin: 0, font: '800 28px var(--head)' }}>{comprador.nombreComercial}</h2>
              <div className="mini">
                {esCentro ? 'Centro de acopio' : 'Comprador móvil'} · enviado {formatearHace(detalle.creadaEn)}
              </div>
            </div>
          </div>
          <Pildora estado={detalle.estado} />
        </div>
        {comprador.descripcion && <p style={{ marginTop: 12 }}>{comprador.descripcion}</p>}
      </div>
      {detalle.cambioDireccion && (
        <div className="panel" data-cambio-direccion>
          <h3>
            Cambio de dirección{' '}
            <small style={{ font: '500 12px var(--body)', color: 'var(--muted)' }}>
              el negocio sigue visible con la dirección vigente hasta que lo apruebes
            </small>
          </h3>
          <div className="grid2" style={{ gap: 12 }}>
            <div data-direccion="vigente">
              <b>Vigente</b>
              <div>{detalle.cambioDireccion.vigente.direccion ?? 'No indicado'}</div>
              <div className="mini">
                {detalle.cambioDireccion.vigente.zona ?? 'Sin zona'}
                {detalle.cambioDireccion.vigente.pin
                  ? ` · pin ${detalle.cambioDireccion.vigente.pin.lat.toFixed(4)}, ${detalle.cambioDireccion.vigente.pin.lng.toFixed(4)}`
                  : ' · sin pin'}
              </div>
            </div>
            <div data-direccion="propuesta">
              <b>Propuesta</b>
              <div>{detalle.cambioDireccion.propuesta?.direccion ?? 'No indicado'}</div>
              <div className="mini">
                {detalle.cambioDireccion.propuesta?.zona ?? 'Sin zona'}
                {detalle.cambioDireccion.propuesta?.pin
                  ? ` · pin ${detalle.cambioDireccion.propuesta.pin.lat.toFixed(4)}, ${detalle.cambioDireccion.propuesta.pin.lng.toFixed(4)}`
                  : ' · sin pin nuevo'}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="grid2">
        <div className="panel">
          <h3>Datos enviados</h3>
          <div className="list" style={{ gap: 10, fontSize: 14 }}>
            {fila(esCentro ? 'Dirección' : 'Zona de trabajo', esCentro ? comprador.direccion : comprador.zona?.nombre)}
            {esCentro && fila('Zona', comprador.zona?.nombre)}
            {fila('Vehículo', comprador.vehiculo ? TEXTO_VEHICULO[comprador.vehiculo] : null)}
            {fila('WhatsApp', formatearTelefono(comprador.whatsapp))}
            {fila('Teléfono', comprador.telefonoNegocio ? formatearTelefono(comprador.telefonoNegocio) : null)}
            {fila(
              'Horario',
              esCentro
                ? formatearHorario(comprador.horarios)
                : comprador.horaInicio && comprador.horaFin
                  ? `${comprador.horaInicio}–${comprador.horaFin} · días no indicados`
                  : 'No indicado',
            )}
            {fila(
              'Pagos',
              comprador.pagos.length
                ? comprador.pagos.map((pago) => TEXTO_PAGO[pago] ?? pago).join(', ')
                : 'No indicado',
            )}
            {fila(
              'Fotos',
              comprador.fotos.length === 0
                ? 'Sin fotos'
                : `${comprador.fotos.length} ${comprador.fotos.length === 1 ? 'foto' : 'fotos'}`,
            )}
          </div>
          {comprador.fotos.length > 0 && (
            <div className="row g8" style={{ marginTop: 12 }}>
              {comprador.fotos.map((id) => (
                <Miniatura key={id} id={id} alAbrir={setFotoAbierta} />
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <h3>
            Precios declarados{' '}
            <small style={{ font: '500 12px var(--body)', color: 'var(--muted)' }}>solo lectura</small>
          </h3>
          <div className="list" style={{ gap: 8 }}>
            {comprador.precios.map((precio) => (
              <div
                key={precio.material.codigo}
                className="row sp"
                style={{ padding: '6px 0', borderBottom: '1.5px solid var(--line)', gap: 8 }}
              >
                <span className="row g8">
                  <span
                    className="mi"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: FONDO_MATERIAL[precio.material.codigo],
                    }}
                  >
                    <Icono nombre={ICONO_MATERIAL[precio.material.codigo]} tamano="sm" />
                  </span>
                  <b style={{ font: '600 14px var(--head)', color: 'var(--ink)' }}>{precio.material.nombre}</b>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ font: '600 14px var(--mono)', color: 'var(--ink)' }}>
                    S/ {precio.min}–{precio.max}
                  </span>
                  <span className="mini" style={{ display: 'block' }}>
                    {DEMANDA[precio.demanda]}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Nota>Como administrador no puedes editar estos precios. Si algo no cuadra, pide información.</Nota>
          </div>
        </div>
      </div>
      {pendiente ? (
        <div className="panel">
          <h3>Decisión</h3>
          {detalle.estado === 'INFO_PEDIDA' && detalle.motivo && (
            <p className="mini" style={{ marginBottom: 10 }}>
              Se pidió: {detalle.motivo}. Aún no lo corrige.
            </p>
          )}
          <div className="row wr g8">
            <button type="button" className="btn p" onClick={() => alDecidir('aprobar')}>
              <Icono nombre="i-check" />
              Aprobar y mostrar en el mapa
            </button>
            <button type="button" className="btn" onClick={() => alDecidir('pedir-informacion')}>
              Pedir información
            </button>
            <button type="button" className="btn dn" onClick={() => alDecidir('rechazar')}>
              Rechazar con motivo
            </button>
          </div>
        </div>
      ) : (
        <div className="panel">
          <h3>Resultado</h3>
          <p>
            {detalle.estado === 'APROBADO'
              ? 'Aprobado. Ya aparece en el mapa.'
              : `Rechazado. Motivo: ${detalle.motivo ?? '—'}.${detalle.mensaje ? ` ${detalle.mensaje}` : ''}`}
          </p>
        </div>
      )}
      <FotoGrande id={fotoAbierta} alCerrar={() => setFotoAbierta(null)} />
    </>
  );
}

function Contenido() {
  const aviso = useAviso();
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [cola, setCola] = useState<{ datos: FilaCola[]; conteos: Record<Filtro, number> } | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarCola = useCallback(async (actual: Filtro) => {
    try {
      const respuesta = await pedir<{ datos: FilaCola[]; conteos: Record<Filtro, number> }>(
        `/admin/verificaciones?estado=${actual}`,
      );
      setCola(respuesta);
      setSeleccion((anterior) =>
        respuesta.datos.some((fila) => fila.id === anterior) ? anterior : (respuesta.datos[0]?.id ?? null),
      );
      setError(null);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargar la cola.');
    }
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<{ datos: FilaCola[]; conteos: Record<Filtro, number> }>(`/admin/verificaciones?estado=${filtro}`)
      .then((respuesta) => {
        if (!vigente) return;
        setCola(respuesta);
        setSeleccion((anterior) =>
          respuesta.datos.some((fila) => fila.id === anterior) ? anterior : (respuesta.datos[0]?.id ?? null),
        );
        setError(null);
      })
      .catch(
        (causa: unknown) =>
          vigente && setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargar la cola.'),
      );
    return () => {
      vigente = false;
    };
  }, [filtro]);

  useEffect(() => {
    if (!seleccion) return;
    let vigente = true;
    pedir<Detalle>(`/admin/verificaciones/${seleccion}`)
      .then((respuesta) => vigente && setDetalle(respuesta))
      .catch(() => vigente && setDetalle(null));
    return () => {
      vigente = false;
    };
  }, [seleccion]);

  const detalleVisible = detalle && detalle.id === seleccion ? detalle : null;

  const decidir = async (accion: 'aprobar' | Modo, datos?: { motivo: string; mensaje: string }) => {
    if (!detalleVisible) return;
    const nombre = detalleVisible.comprador.nombreComercial;
    try {
      const respuesta = await pedir<Detalle>(`/admin/verificaciones/${detalleVisible.id}/${accion}`, {
        cuerpo: datos ?? {},
      });
      setDetalle(respuesta);
      setModo(null);
      aviso(
        accion === 'aprobar'
          ? `${nombre} aprobado. Ya aparece en el mapa.`
          : accion === 'rechazar'
            ? 'Rechazado. Se registró el motivo y se avisó en la app y por SMS.'
            : 'Se pidió información. Se avisó en la app y por SMS.',
      );
      await cargarCola(filtro);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos registrar la decisión.');
      await cargarCola(filtro);
    }
  };

  return (
    <MarcoApp activa="ver">
      <div className="ph">
        <div>
          <span className="kick">Cola de verificación</span>
          <h1>
            Revisa antes de <u>mostrar en el mapa</u>
          </h1>
          <p>Solo aparecen en el mapa los centros y compradores verificados.</p>
        </div>
      </div>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Nota tono="atencion">{error}</Nota>
        </div>
      )}
      <div className="cols l">
        <section className="stack">
          <div
            className="seg"
            role="group"
            aria-label="Filtrar la cola"
            style={{ width: '100%', gridAutoColumns: '1fr' }}
          >
            {FILTROS.map(([valor, texto]) => (
              <button key={valor} type="button" aria-pressed={valor === filtro} onClick={() => setFiltro(valor)}>
                {texto} {cola?.conteos[valor] ?? ''}
              </button>
            ))}
          </div>
          <div className="list">
            {!cola ? (
              <PantallaCargando />
            ) : cola.datos.length === 0 ? (
              <EstadoVacio titulo="No hay nada en esta lista" />
            ) : (
              cola.datos.map((fila) => {
                const elegida = fila.id === seleccion;
                return (
                  <button
                    key={fila.id}
                    type="button"
                    className="panel"
                    aria-current={elegida}
                    onClick={() => setSeleccion(fila.id)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: 14,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      width: '100%',
                      background: elegida ? 'var(--color-nota)' : undefined,
                      boxShadow: elegida ? '5px 5px 0 var(--g)' : '3px 3px 0 var(--ink)',
                    }}
                  >
                    <span className={clases('ico', fila.comprador.tipo !== 'CENTRO' && 's')}>
                      <Icono nombre={fila.comprador.tipo === 'CENTRO' ? 'i-store' : 'i-truck'} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <b style={{ font: '700 16px var(--head)', color: 'var(--ink)' }}>
                        {fila.comprador.nombreComercial}
                      </b>
                      <div className="mini">
                        {fila.comprador.tipo === 'CENTRO' ? 'Centro de acopio' : 'Comprador móvil'} ·{' '}
                        {formatearHace(fila.creadaEn)}
                        {fila.tipo === 'CAMBIO_DIRECCION' && ' · Cambio de dirección'}
                      </div>
                    </div>
                    <Pildora estado={fila.estado} />
                  </button>
                );
              })
            )}
          </div>
        </section>
        <section className="stack" aria-live="polite">
          {detalleVisible ? (
            <FichaNegocio
              detalle={detalleVisible}
              alDecidir={(accion) => (accion === 'aprobar' ? void decidir('aprobar') : setModo(accion))}
            />
          ) : (
            seleccion && <PantallaCargando />
          )}
        </section>
      </div>
      <VentanaDecision
        modo={modo}
        negocio={detalleVisible?.comprador.nombreComercial ?? ''}
        alCerrar={() => setModo(null)}
        alConfirmar={(motivo, mensaje) => (modo ? decidir(modo, { motivo, mensaje }) : Promise.resolve())}
      />
    </MarcoApp>
  );
}

export function ColaVerificacion() {
  return (
    <Protegida roles={['ADMIN']}>
      <Contenido />
    </Protegida>
  );
}
