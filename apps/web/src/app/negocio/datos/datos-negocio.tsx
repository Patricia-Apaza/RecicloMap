'use client';

import '@/acceso/acceso.css';
import { esquemaDatosNegocio, formatearFecha, METODOS_PAGO, VEHICULOS } from '@reciclomap/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { useZonasActivas } from '@/mapa/pedir-ubicacion';
import { TEXTO_PAGO, TEXTO_VEHICULO } from '@/mapa/resultados';
import { type Punto, SelectorPin } from '@/mapa/selector-pin';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Pago = (typeof METODOS_PAGO)[number];
type Datos = {
  tipo: 'CENTRO' | 'MOVIL';
  estadoVerificacion: string;
  nombreComercial: string;
  descripcion: string | null;
  whatsapp: string;
  telefonoNegocio: string | null;
  vehiculo: (typeof VEHICULOS)[number] | null;
  direccion: string | null;
  zona: { id: number; nombre: string } | null;
  ubicacion: Punto | null;
  horario: {
    dias: Array<{ dia: number; abre: string; cierra: string }>;
    habitual: { abre: string; cierra: string } | null;
  };
  pagos: Pago[];
  cambioDireccion: {
    estado: string;
    cambios: { direccion: string; zona: string };
    motivo: string | null;
    creadaEn: string;
    resueltaEn: string | null;
  } | null;
};
type Dia = { activo: boolean; abre: string; cierra: string };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function diasDe(datos: Datos): Dia[] {
  return DIAS.map((_, i) => {
    const fila = datos.horario.dias.find((d) => d.dia === i + 1);
    return fila
      ? { activo: true, abre: fila.abre, cierra: fila.cierra }
      : { activo: false, abre: '08:00', cierra: '18:00' };
  });
}

function CambioDireccion({ datos, alEnviar }: { datos: Datos; alEnviar: () => void }) {
  const aviso = useAviso();
  const zonas = useZonasActivas();
  const { configuracion } = useConfiguracionPublica();
  const [abierto, setAbierto] = useState(false);
  const [direccion, setDireccion] = useState(datos.direccion ?? '');
  const [zonaId, setZonaId] = useState<number | null>(datos.zona?.id ?? null);
  const [pin, setPin] = useState<Punto | null>(datos.ubicacion);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pendiente = datos.cambioDireccion?.estado === 'EN_REVISION';

  const enviar = async () => {
    if (direccion.trim().length < 5 || !zonaId) {
      setError('Escribe la dirección y elige la zona.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await pedir('/mi-negocio/cambio-direccion', {
        cuerpo: { direccion: direccion.trim(), zonaId, ubicacion: configuracion?.mapa ? pin : null },
      });
      aviso('Solicitud enviada. Sigues visible con tu dirección actual mientras la revisamos.');
      setAbierto(false);
      alEnviar();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="panel stack" style={{ gap: 12 }} data-cambio-direccion>
      <h3>Dirección del local</h3>
      <div className="row g8" style={{ alignItems: 'flex-start' }}>
        <Icono nombre="i-pin" />
        <span>
          <b>{datos.direccion}</b>
          <span className="mini" style={{ display: 'block' }}>
            {datos.zona?.nombre}
          </span>
        </span>
      </div>
      {datos.cambioDireccion && (
        <div
          className={pendiente ? 'note' : datos.cambioDireccion.estado === 'RECHAZADO' ? 'note warn' : 'note'}
          role="status"
        >
          <Icono nombre={pendiente ? 'i-clock' : 'i-info'} />
          <span>
            {pendiente
              ? `En revisión: ${datos.cambioDireccion.cambios.direccion}. Sigues visible con la dirección actual.`
              : datos.cambioDireccion.estado === 'RECHAZADO'
                ? `No aprobamos el cambio a ${datos.cambioDireccion.cambios.direccion}. Motivo: ${datos.cambioDireccion.motivo ?? '—'}.`
                : `Cambio aprobado el ${formatearFecha(datos.cambioDireccion.resueltaEn ?? datos.cambioDireccion.creadaEn)}.`}
          </span>
        </div>
      )}
      {!pendiente && !abierto && (
        <button type="button" className="btn sm" onClick={() => setAbierto(true)} style={{ alignSelf: 'flex-start' }}>
          Solicitar cambio de dirección
        </button>
      )}
      {abierto && (
        <div className="stack" style={{ gap: 12 }}>
          <Campo
            etiqueta="Nueva dirección"
            maxLength={160}
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
          />
          <div className="field">
            <label htmlFor="zona-nueva">Zona</label>
            <div className="inp">
              <select id="zona-nueva" value={zonaId ?? ''} onChange={(e) => setZonaId(Number(e.target.value) || null)}>
                <option value="">Elige la zona</option>
                {zonas?.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {configuracion?.mapa && (
            <div className="field">
              <span className="lbl">Pin del local</span>
              <SelectorPin valor={pin} centro={datos.ubicacion} alCambiar={setPin} />
            </div>
          )}
          {error && (
            <div className="note warn" role="alert">
              {error}
            </div>
          )}
          <div className="row g8 wr">
            <button type="button" className="btn p" disabled={enviando} onClick={() => void enviar()}>
              {enviando ? 'Enviando…' : 'Enviar a verificación'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Pantalla 47: datos, horario y pagos se aplican al momento; la dirección pasa por el administrador (S5)
function Contenido() {
  const aviso = useAviso();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [nombre, setNombre] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telefono, setTelefono] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [vehiculo, setVehiculo] = useState<string>('');
  const [dias, setDias] = useState<Dia[]>([]);
  const [habitual, setHabitual] = useState({ abre: '08:00', cierra: '17:00' });
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const llenar = useCallback((d: Datos) => {
    setDatos(d);
    setNombre(d.nombreComercial);
    setWhatsapp(d.whatsapp);
    setTelefono(d.telefonoNegocio ?? '');
    setDescripcion(d.descripcion ?? '');
    setVehiculo(d.vehiculo ?? '');
    setDias(diasDe(d));
    setHabitual(d.horario.habitual ?? { abre: '08:00', cierra: '17:00' });
    setPagos(d.pagos);
    setErrores({});
  }, []);

  const cargar = useCallback(async () => llenar(await pedir<Datos>('/mi-negocio/datos')), [llenar]);

  useEffect(() => {
    let vigente = true;
    pedir<Datos>('/mi-negocio/datos')
      .then((d) => vigente && llenar(d))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [llenar]);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!datos) return;
    const centro = datos.tipo === 'CENTRO';
    const lectura = esquemaDatosNegocio.safeParse({
      nombreComercial: nombre,
      descripcion,
      whatsapp,
      telefonoNegocio: centro && telefono ? telefono : null,
      vehiculo: centro ? null : vehiculo || undefined,
    });
    const nuevos: Record<string, string> = {};
    if (!lectura.success) for (const p of lectura.error.issues) nuevos[String(p.path[0])] ??= p.message;
    if (!centro && !vehiculo) nuevos.vehiculo = 'Elige tu vehículo.';
    const activos = dias.map((d, i) => ({ ...d, dia: i + 1 })).filter((d) => d.activo);
    if (centro && activos.length === 0) nuevos.horario = 'Marca al menos un día de atención.';
    if (centro && activos.some((d) => d.cierra <= d.abre))
      nuevos.horario = 'Revisa las horas: la final debe ser posterior a la inicial.';
    if (!centro && habitual.cierra <= habitual.abre)
      nuevos.horario = 'Revisa las horas: la final debe ser posterior a la inicial.';
    if (centro && pagos.length === 0) nuevos.pagos = 'Elige al menos un medio de pago.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !lectura.success) return;
    setGuardando(true);
    try {
      await pedir('/mi-negocio/datos', { metodo: 'PATCH', cuerpo: lectura.data });
      await pedir('/mi-negocio/horarios', {
        metodo: 'PUT',
        cuerpo: centro
          ? { dias: activos.map(({ dia, abre, cierra }) => ({ dia, abre, cierra })), habitual: null }
          : { dias: [], habitual },
      });
      llenar(await pedir<Datos>('/mi-negocio/pagos', { metodo: 'PUT', cuerpo: { pagos } }));
      aviso('Datos guardados');
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos guardar los datos.' });
    } finally {
      setGuardando(false);
    }
  };

  if (!datos) return <span className="girando" role="status" aria-label="Cargando" />;
  const centro = datos.tipo === 'CENTRO';
  const abiertos = dias.filter((d) => d.activo);
  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi negocio"
        titulo="Datos y"
        resaltado="horarios"
        descripcion="Lo que los recicladores ven en el mapa. Mantén tu horario al día para no recibir visitas en vano."
        acciones={
          datos.estadoVerificacion === 'APROBADO' ? (
            <span className="pill open">
              <i />
              Verificado
            </span>
          ) : undefined
        }
      />
      <div className="cols">
        <form className="panel" onSubmit={(e) => void guardar(e)} noValidate>
          <h2>Información del negocio</h2>
          <div className="stack" style={{ gap: 18 }}>
            <div className="grid2" style={{ gap: 16 }}>
              <Campo
                etiqueta="Nombre del negocio"
                maxLength={120}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                error={errores.nombreComercial}
              />
              <Campo
                etiqueta="WhatsApp"
                prefijo="+51"
                inputMode="numeric"
                maxLength={11}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                error={errores.whatsapp}
              />
            </div>
            {centro ? (
              <Campo
                etiqueta="Teléfono del local"
                opcional
                prefijo="+51"
                inputMode="numeric"
                maxLength={11}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                error={errores.telefonoNegocio}
              />
            ) : (
              <div className={errores.vehiculo ? 'field err' : 'field'}>
                <label htmlFor="vehiculo">Vehículo</label>
                <div className="inp">
                  <select id="vehiculo" value={vehiculo} onChange={(e) => setVehiculo(e.target.value)}>
                    <option value="">Elige tu vehículo</option>
                    {VEHICULOS.map((v) => (
                      <option key={v} value={v}>
                        {TEXTO_VEHICULO[v] ?? v}
                      </option>
                    ))}
                  </select>
                </div>
                {errores.vehiculo && <span className="msg">{errores.vehiculo}</span>}
              </div>
            )}
            <div className={errores.horario ? 'field err' : 'field'}>
              <span className="lbl">{centro ? 'Horario de atención' : 'Horario habitual'}</span>
              {centro ? (
                <div className="list" style={{ gap: 8 }} role="group" aria-label="Horario de atención">
                  {dias.map((d, i) => (
                    <div key={DIAS[i]} className="row g16 wr">
                      <label className="row g8" style={{ width: 100 }}>
                        <span className="sw" style={{ transform: 'scale(.8)', transformOrigin: 'left' }}>
                          <input
                            type="checkbox"
                            role="switch"
                            checked={d.activo}
                            aria-label={`Abre el ${DIAS[i]}`}
                            onChange={(e) =>
                              setDias((todos) =>
                                todos.map((x, j) => (j === i ? { ...x, activo: e.target.checked } : x)),
                              )
                            }
                          />
                          <i aria-hidden="true" />
                        </span>
                        <b>{DIAS[i]}</b>
                      </label>
                      <div className="inp" style={{ height: 42, width: 130, opacity: d.activo ? 1 : 0.4 }}>
                        <input
                          type="time"
                          aria-label={`${DIAS[i]} abre`}
                          value={d.abre}
                          disabled={!d.activo}
                          onChange={(e) =>
                            setDias((todos) => todos.map((x, j) => (j === i ? { ...x, abre: e.target.value } : x)))
                          }
                        />
                      </div>
                      <span>a</span>
                      <div className="inp" style={{ height: 42, width: 130, opacity: d.activo ? 1 : 0.4 }}>
                        <input
                          type="time"
                          aria-label={`${DIAS[i]} cierra`}
                          value={d.cierra}
                          disabled={!d.activo}
                          onChange={(e) =>
                            setDias((todos) => todos.map((x, j) => (j === i ? { ...x, cierra: e.target.value } : x)))
                          }
                        />
                      </div>
                      {!d.activo && <span className="mini">Cerrado</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="row g16 wr">
                  <div className="inp" style={{ height: 42, width: 130 }}>
                    <input
                      type="time"
                      aria-label="Desde"
                      value={habitual.abre}
                      onChange={(e) => setHabitual((h) => ({ ...h, abre: e.target.value }))}
                    />
                  </div>
                  <span>a</span>
                  <div className="inp" style={{ height: 42, width: 130 }}>
                    <input
                      type="time"
                      aria-label="Hasta"
                      value={habitual.cierra}
                      onChange={(e) => setHabitual((h) => ({ ...h, cierra: e.target.value }))}
                    />
                  </div>
                </div>
              )}
              {errores.horario && <span className="msg">{errores.horario}</span>}
            </div>
            <div className={errores.pagos ? 'field err' : 'field'}>
              <span className="lbl">Medios de pago</span>
              <div className="row wr g8" role="group" aria-label="Medios de pago">
                {METODOS_PAGO.map((metodo) => (
                  <label key={metodo} className="cp">
                    <input
                      type="checkbox"
                      checked={pagos.includes(metodo)}
                      onChange={(e) =>
                        setPagos((todos) => (e.target.checked ? [...todos, metodo] : todos.filter((p) => p !== metodo)))
                      }
                      style={{ accentColor: 'var(--btn)', margin: 0 }}
                    />
                    {TEXTO_PAGO[metodo] ?? metodo}
                  </label>
                ))}
              </div>
              {errores.pagos && <span className="msg">{errores.pagos}</span>}
            </div>
            <div className="field">
              <label htmlFor="descripcion">
                Descripción <span className="opt">(opcional)</span>
              </label>
              <div className="inp ta">
                <textarea
                  id="descripcion"
                  rows={3}
                  maxLength={160}
                  placeholder="Ej. Recibimos material limpio y separado. Báscula calibrada."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
            </div>
            {errores.general && (
              <div className="note warn" role="alert">
                {errores.general}
              </div>
            )}
            <div className="row g16 wr">
              <button className="btn p" type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button type="button" className="btn ghost" onClick={() => llenar(datos)}>
                Descartar
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="panel">
            <h3>Así te ven</h3>
            <div className="row g16" style={{ marginBottom: 10 }}>
              <span className={centro ? 'ico' : 'ico s'} style={{ width: 48, height: 48 }} aria-hidden="true">
                <Icono nombre={centro ? 'i-store' : 'i-truck'} />
              </span>
              <div>
                <b style={{ font: '800 18px var(--head)' }}>{nombre || datos.nombreComercial}</b>
                <div className="mini">{centro ? datos.direccion : `Zona: ${datos.zona?.nombre ?? '—'}`}</div>
              </div>
            </div>
            <div className="mini">
              <Icono nombre="i-clock" tamano="sm" />{' '}
              {centro
                ? abiertos.length
                  ? `${abiertos[0]!.abre} – ${abiertos[0]!.cierra} · ${abiertos.length} días por semana`
                  : 'Sin horario'
                : `${habitual.abre} – ${habitual.cierra}`}
            </div>
            <div className="row g8 wr" style={{ marginTop: 8 }}>
              {pagos.map((p) => (
                <span key={p} className="pill grey">
                  {TEXTO_PAGO[p] ?? p}
                </span>
              ))}
            </div>
            <p className="mini" style={{ marginTop: 10 }}>
              {descripcion || 'Sin descripción.'}
            </p>
          </div>
          {centro && <CambioDireccion datos={datos} alEnviar={() => void cargar()} />}
          <div className="note">
            <Icono nombre="i-info" />
            <span>
              {centro
                ? 'Los cambios de dirección vuelven a pasar por verificación para evitar negocios falsos.'
                : 'Tu zona de trabajo se cambia desde tu inicio de comprador móvil.'}
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}

export function DatosNegocio() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
