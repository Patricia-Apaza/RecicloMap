'use client';

import {
  type CodigoMaterial,
  esquemaReporteNegocio,
  formatearHace,
  MOTIVOS_REPORTE_NEGOCIO,
  type MotivoReporteNegocio,
  TEXTO_MOTIVO_REPORTE,
} from '@reciclomap/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { useFiltrosMapa } from '@/mapa/filtros';
import { hace, type Opcion } from '@/mapa/resultados';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { soles } from '@/publicaciones/piezas';
import { PildoraReporte } from '@/reportes/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Ficha = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  direccion: string | null;
  zona: string | null;
  materiales: Array<{
    material: { codigo: CodigoMaterial; nombre: string };
    min: string;
    max: string;
    actualizadoEn: string;
  }>;
};
type MiReporte = {
  id: string;
  motivo: string;
  estado: string;
  creadoEn: string;
  negocio: string;
  material: { nombre: string } | null;
};

const OPCIONES: Record<MotivoReporteNegocio, [NombreIcono, string]> = {
  PRECIO: ['i-cash', 'El precio publicado no es el que pagan'],
  CERRADO: ['i-clock', 'Fui y no atendían en su horario'],
  UBICACION: ['i-pin', 'No está donde marca el mapa'],
  FALSA: ['i-alert', 'Datos que no existen o engañosos'],
  OTRO: ['i-info', 'Algo distinto a lo anterior'],
};

// Pantalla 16: solo el reciclador; el negocio nunca sabe quién lo reportó y el precio no cambia solo
function Contenido() {
  const parametros = useSearchParams();
  const { filtros } = useFiltrosMapa();
  const { ubicacion } = useUbicacion();
  const cabeceras = useMemo(() => cabecerasDeUbicacion(ubicacion), [ubicacion]);
  const [negocioId, setNegocioId] = useState(parametros.get('negocio') ?? '');
  const [material, setMaterial] = useState(parametros.get('material') ?? '');
  const [motivo, setMotivo] = useState<MotivoReporteNegocio | null>(null);
  const [precio, setPrecio] = useState('');
  const [detalle, setDetalle] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [opciones, setOpciones] = useState<Array<{ id: string; nombre: string; tipo: string }>>([]);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [mios, setMios] = useState<MiReporte[]>([]);

  const cargarMios = useCallback(async () => {
    setMios((await pedir<{ datos: MiReporte[] }>('/reportes/mios')).datos);
  }, []);

  useEffect(() => {
    let vigente = true;
    pedir<{ datos: MiReporte[] }>('/reportes/mios')
      .then((respuesta) => vigente && setMios(respuesta.datos))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (!ubicacion) return;
    let vigente = true;
    pedir<{ opciones: Opcion[] }>(`/compradores?material=${filtros.material}&radio=20&orden=cercania`, { cabeceras })
      .then((r) => vigente && setOpciones(r.opciones.map((o) => ({ id: o.id, nombre: o.nombre, tipo: o.tipo }))))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [ubicacion, filtros.material, cabeceras]);

  useEffect(() => {
    if (!negocioId) return;
    let vigente = true;
    pedir<Ficha>(`/compradores/${negocioId}`)
      .then((respuesta) => vigente && setFicha(respuesta))
      .catch(() => vigente && setFicha(null));
    return () => {
      vigente = false;
    };
  }, [negocioId]);

  const elegido = ficha?.id === negocioId ? ficha : null;
  const publicado = elegido?.materiales.find((m) => m.material.codigo === material);
  const visto = Number(precio.replace(',', '.'));
  const muyDistinto =
    publicado && visto > 0 && (visto < Number(publicado.min) * 0.7 || visto > Number(publicado.max) * 1.3);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const lectura = esquemaReporteNegocio.safeParse({
      compradorId: negocioId,
      motivo: motivo ?? undefined,
      material: material || null,
      precioVisto: motivo === 'PRECIO' && precio ? precio : null,
      detalle,
    });
    if (!lectura.success) {
      const nuevos: Record<string, string> = {};
      for (const problema of lectura.error.issues) nuevos[String(problema.path[0])] ??= problema.message;
      setErrores(nuevos);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      const respuesta = await pedir<{ negocio: string }>('/reportes', { cuerpo: lectura.data });
      setEnviado(respuesta.negocio);
      await cargarMios();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos enviar tu reporte.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Reportar información"
        titulo="Avísanos si algo"
        resaltado="no coincide"
        descripcion="Tu aviso ayuda a mantener el mapa confiable. Un administrador lo revisa; el precio nunca cambia solo."
        acciones={
          <Link className="btn ghost" href={negocioId ? `/negocios/${negocioId}` : RUTAS.mapa}>
            <Icono nombre="i-arrow-left" />
            Volver
          </Link>
        }
      />
      <div className="cols">
        {enviado ? (
          <section className="panel">
            <div className="empty" style={{ border: 0, padding: '40px 10px' }} role="status">
              <span className="ico m" style={{ width: 72, height: 72, borderRadius: 22 }}>
                <Icono nombre="i-check" tamano="lg" />
              </span>
              <h2 style={{ margin: 0, font: '800 30px var(--head)' }}>¡Gracias por avisarnos!</h2>
              <p style={{ maxWidth: 440 }}>
                Recibimos tu reporte sobre <b>{enviado}</b>. Un administrador lo va a revisar. El precio no se modifica
                automáticamente.
              </p>
              <div className="row g16 wr" style={{ justifyContent: 'center' }}>
                <Link className="btn p" href={`/negocios/${negocioId}`}>
                  Volver al detalle
                </Link>
                <Link className="btn" href={RUTAS.mapa}>
                  Ir al mapa
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <form className="panel" onSubmit={(e) => void enviar(e)} noValidate>
            <h2>Cuéntanos qué viste</h2>
            <div className="stack" style={{ gap: 20 }}>
              <div className="grid2" style={{ gap: 16 }}>
                <div className={errores.compradorId ? 'field err' : 'field'}>
                  <label htmlFor="negocio">
                    ¿Dónde? <span className="opt">(centro o comprador)</span>
                  </label>
                  <div className="inp">
                    <select id="negocio" value={negocioId} onChange={(e) => setNegocioId(e.target.value)}>
                      <option value="">Elige un negocio</option>
                      {elegido && !opciones.some((o) => o.id === elegido.id) && (
                        <option value={elegido.id}>{elegido.nombre}</option>
                      )}
                      {opciones.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre} · {o.tipo === 'CENTRO' ? 'Centro de acopio' : 'Comprador móvil'}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errores.compradorId && <span className="msg">Elige el negocio.</span>}
                </div>
                <div className="field">
                  <label htmlFor="material">
                    Material <span className="opt">(si aplica)</span>
                  </label>
                  <div className="inp">
                    <select id="material" value={material} onChange={(e) => setMaterial(e.target.value)}>
                      <option value="">Ninguno en particular</option>
                      {elegido?.materiales.map((m) => (
                        <option key={m.material.codigo} value={m.material.codigo}>
                          {m.material.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className={errores.motivo ? 'field err' : 'field'}>
                <span className="lbl">¿Qué pasa?</span>
                <div className="grid3" role="group" aria-label="Qué pasa" style={{ gap: 12 }}>
                  {MOTIVOS_REPORTE_NEGOCIO.map((clave) => (
                    <button
                      key={clave}
                      type="button"
                      className="opt-card"
                      aria-pressed={motivo === clave}
                      onClick={() => setMotivo(clave)}
                    >
                      <span className="mi" style={{ background: 'var(--sand)' }}>
                        <Icono nombre={OPCIONES[clave][0]} />
                      </span>
                      <b>{TEXTO_MOTIVO_REPORTE[clave]}</b>
                      <small>{OPCIONES[clave][1]}</small>
                    </button>
                  ))}
                </div>
                {errores.motivo && <span className="msg">Elige una opción.</span>}
              </div>
              {motivo === 'PRECIO' && (
                <div className={errores.precioVisto ? 'field err' : 'field'}>
                  <label htmlFor="precio">
                    Precio que viste <span className="opt">(S/ por kg, opcional)</span>
                  </label>
                  <div className="inp">
                    <span className="u">S/</span>
                    <input
                      id="precio"
                      inputMode="decimal"
                      placeholder="Ej. 2.10"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                    />
                    <span className="u">por kg</span>
                  </div>
                  {publicado && (
                    <span className="hint">
                      Publicado: {soles(publicado.min)} a {Number(publicado.max).toFixed(2)} por kg
                      {muyDistinto ? '. Tu precio se ve muy distinto; lo revisaremos con cuidado.' : '.'}
                    </span>
                  )}
                  {errores.precioVisto && <span className="msg">{errores.precioVisto}</span>}
                </div>
              )}
              <div className={errores.detalle ? 'field err' : 'field'}>
                <label htmlFor="detalle">
                  Detalle{' '}
                  <span className="opt">
                    {motivo === 'FALSA' || motivo === 'OTRO' ? '(obligatorio)' : '(opcional)'}
                  </span>
                </label>
                <div className="inp ta">
                  <textarea
                    id="detalle"
                    rows={3}
                    maxLength={240}
                    placeholder="Ej. Fui hoy a las 3 pm y el cartón lo pagaban a S/ 0.40."
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                  />
                </div>
                <div className="row sp">
                  {errores.detalle ? <span className="msg">{errores.detalle}</span> : <span />}
                  <span className="hint mono">{detalle.length} / 240</span>
                </div>
              </div>
              <div className="note">
                <Icono nombre="i-lock" />
                <span>Tu reporte es privado: el negocio no sabrá quién lo envió.</span>
              </div>
              {errores.general && (
                <div className="note warn" role="alert">
                  {errores.general}
                </div>
              )}
              <div className="row g16 wr">
                <button className="btn p" type="submit" disabled={enviando}>
                  {enviando ? 'Enviando…' : 'Enviar reporte'}
                </button>
                <Link className="btn ghost" href={RUTAS.mapa}>
                  Cancelar
                </Link>
              </div>
            </div>
          </form>
        )}
        <aside className="stack">
          <div className="panel">
            <h3>Lo que muestra el mapa</h3>
            {elegido ? (
              <>
                <div className="row g16" style={{ marginBottom: 10 }}>
                  <span className={elegido.tipo === 'CENTRO' ? 'ico' : 'ico s'} aria-hidden="true">
                    <Icono nombre={elegido.tipo === 'CENTRO' ? 'i-store' : 'i-truck'} />
                  </span>
                  <div>
                    <b style={{ font: '700 16px var(--head)' }}>{elegido.nombre}</b>
                    <div className="mini">{elegido.tipo === 'CENTRO' ? elegido.direccion : elegido.zona}</div>
                  </div>
                </div>
                <table className="tbl">
                  <tbody>
                    {elegido.materiales.map((m) => (
                      <tr key={m.material.codigo}>
                        <td>{m.material.nombre}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {soles(m.min)}–{Number(m.max).toFixed(2)}
                        </td>
                        <td className="mini" style={{ textAlign: 'right' }}>
                          {hace(m.actualizadoEn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="mini">Elige un negocio para ver sus precios publicados.</p>
            )}
          </div>
          <div className="panel">
            <h3>Qué pasa después</h3>
            <div className="list" style={{ gap: 12 }}>
              {[
                ['var(--sky)', 'Un administrador revisa tu reporte.'],
                ['var(--sand)', 'Si corresponde, le pide al negocio corregir su información.'],
                ['var(--mint)', 'Si no lo corrige a tiempo, su visibilidad puede suspenderse.'],
              ].map(([fondo, texto], indice) => (
                <div key={texto} className="row g16" style={{ alignItems: 'flex-start' }}>
                  <span className="mi" style={{ background: fondo }}>
                    {indice + 1}
                  </span>
                  <span>{texto}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Tus reportes</h3>
            <div className="list" style={{ gap: 10 }} data-mis-reportes>
              {mios.length === 0 && <p className="mini">Todavía no enviaste ningún reporte.</p>}
              {mios.map((r) => (
                <div key={r.id} style={{ border: '2px solid var(--ink)', borderRadius: 14, padding: '10px 12px' }}>
                  <div className="row sp">
                    <PildoraReporte estado={r.estado} />
                    <span className="mini">{formatearHace(r.creadoEn)}</span>
                  </div>
                  <b style={{ font: '700 14px var(--head)', display: 'block', marginTop: 6 }}>
                    {TEXTO_MOTIVO_REPORTE[r.motivo]} · {r.negocio}
                  </b>
                  {r.material && <span className="mini">{r.material.nombre}</span>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export function ReportarInformacion() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="mapa">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
