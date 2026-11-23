'use client';

import {
  esquemaReactivar,
  esquemaSuspender,
  formatearFecha,
  formatearHace,
  formatearTelefono,
  MOTIVOS_SUSPENSION,
  type MotivoSuspension,
} from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Fila = {
  id: string;
  nombre: string;
  rol: string;
  estado: string;
  motivoSuspension: string | null;
  creadoEn: string;
  ciudad: { id: number; nombre: string };
  actividad: string | null;
};
type Lista = {
  resumen: { total: number; activos: number; suspendidos: number; pendientes: number };
  ciudades: Array<{ id: number; nombre: string }>;
  total: number;
  pagina: number;
  porPagina: number;
  datos: Fila[];
};
type Ficha = {
  id: string;
  rol: string;
  nombre: string;
  nombreComercial: string | null;
  correo: string | null;
  telefono: string;
  ciudad: { nombre: string };
  estado: string;
  motivoSuspension: string | null;
  suspendidoEn: string | null;
  suspendidoPor: string | null;
  creadoEn: string;
  negocio: { tipo: string; plan: string; verificacion: string } | null;
  actividad: {
    operacionesCompletadas: number;
    operacionesCanceladas: number;
    operacionesEnCurso: number;
    kgTotal: number | null;
    publicacionesAbiertas: number;
    ofertasPendientes: number;
    reportesAbiertos: number;
  };
  operacionesEnCurso: Array<{
    id: string;
    estado: string;
    material: string;
    kg: number;
    otraParte: string;
    desde: string;
  }>;
  historialDeSituacion: Array<{ accion: string; motivo: string; fecha: string; administrador: string }>;
};

const ROLES: Array<[string, string]> = [
  ['todos', 'Todos'],
  ['RECICLADOR', 'Recicladores'],
  ['CENTRO', 'Centros'],
  ['COMPRADOR_MOVIL', 'Compradores'],
  ['ADMIN', 'Admin'],
];
const TEXTO_ROL: Record<string, string> = {
  RECICLADOR: 'Reciclador',
  CENTRO: 'Centro',
  COMPRADOR_MOVIL: 'Comprador móvil',
  ADMIN: 'Administración',
};
const TEXTO_ESTADO: Record<string, string> = {
  ACTIVO: 'Activo',
  SUSPENDIDO: 'Suspendido',
  PENDIENTE_TELEFONO: 'Pendiente',
  REGISTRO_INCOMPLETO: 'Pendiente',
};
const TONO: Record<string, string> = {
  ACTIVO: 'open',
  SUSPENDIDO: 'closed',
  PENDIENTE_TELEFONO: 'warn',
  REGISTRO_INCOMPLETO: 'warn',
};
const TEXTO_OPERACION: Record<string, string> = {
  ACEPTADA: 'Aceptada',
  EN_COORDINACION: 'En coordinación',
  ENTREGADA: 'Entregada',
  CONFIRMADA: 'Confirmada',
};

// Confirma antes de afectar a otra persona: la ventana resume qué pasará y pide motivo
function Decision({
  ficha,
  modo,
  alCerrar,
  alResolver,
}: {
  ficha: Ficha;
  modo: 'suspender' | 'reactivar';
  alCerrar: () => void;
  alResolver: () => void;
}) {
  const aviso = useAviso();
  const [motivo, setMotivo] = useState<MotivoSuspension | ''>('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const suspender = modo === 'suspender';
  const nombre = ficha.nombreComercial ?? ficha.nombre;

  const confirmar = async () => {
    const lectura = suspender
      ? esquemaSuspender.safeParse({ motivo, nota, confirmar: true })
      : esquemaReactivar.safeParse({ motivo: nota, confirmar: true });
    if (!lectura.success) {
      const nuevos: Record<string, string> = {};
      for (const p of lectura.error.issues) nuevos[suspender ? String(p.path[0]) : 'nota'] ??= p.message;
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/admin/usuarios/${ficha.id}/${modo}`, { cuerpo: lectura.data });
      aviso(suspender ? `${nombre} fue suspendido` : `${nombre} fue reactivado`);
      alResolver();
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana
      abierta
      alCerrar={alCerrar}
      antetitulo={suspender ? 'SUSPENDER CUENTA' : 'REACTIVAR CUENTA'}
      titulo={nombre}
    >
      {suspender ? (
        <>
          <p className="mini" data-efectos>
            Qué pasará: no podrá publicar, ofertar ni aparecer en el mapa, pero sí leer su historial. Sus publicaciones
            abiertas se ocultan y sus ofertas pendientes se retiran con aviso a la otra parte. Las operaciones en curso
            no se cortan: la otra parte recibe un aviso y puede reportar un problema. Recibirá un aviso con el motivo.
          </p>
          <div className={errores.motivo ? 'field err' : 'field'}>
            <label htmlFor="motivo-suspension">Motivo (obligatorio, se registra)</label>
            <div className="inp">
              <select
                id="motivo-suspension"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoSuspension)}
              >
                <option value="">Elige un motivo</option>
                {MOTIVOS_SUSPENSION.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            {errores.motivo && <span className="msg">{errores.motivo}</span>}
          </div>
        </>
      ) : (
        <p className="mini">
          Podrá publicar y ofertar otra vez, y sus publicaciones abiertas vuelven a verse. Recibirá un aviso.
        </p>
      )}
      <Campo
        etiqueta={suspender ? 'Nota para el registro' : 'Motivo de la reactivación'}
        maxLength={suspender ? 150 : 200}
        placeholder="Qué pasó y qué revisaste"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        error={errores.nota}
      />
      {errores.general && (
        <p className="msg" role="alert">
          {errores.general}
        </p>
      )}
      <div className="row g8 wr">
        <button
          type="button"
          className={suspender ? 'btn dn' : 'btn p'}
          disabled={enviando}
          onClick={() => void confirmar()}
        >
          {suspender ? 'Confirmar suspensión' : 'Confirmar reactivación'}
        </button>
        <button type="button" className="btn" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Ventana>
  );
}

function PanelFicha({ ficha, alCerrar, alCambiar }: { ficha: Ficha; alCerrar: () => void; alCambiar: () => void }) {
  const [modo, setModo] = useState<'suspender' | 'reactivar' | null>(null);
  const a = ficha.actividad;
  const dato = (etiqueta: string, valor: string | number | null) =>
    valor === null || valor === '' ? null : (
      <div className="row sp" style={{ gap: 12 }}>
        <span>{etiqueta}</span>
        <b style={{ textAlign: 'right' }}>{valor}</b>
      </div>
    );
  return (
    <div className="panel" data-panel="ficha">
      <div className="row sp wr">
        <div>
          <h2 style={{ margin: 0 }}>{ficha.nombreComercial ?? ficha.nombre}</h2>
          <div className="mini">
            {TEXTO_ROL[ficha.rol]} · registro {formatearFecha(ficha.creadoEn)}
          </div>
        </div>
        <span className={`pill ${TONO[ficha.estado] ?? 'grey'}`}>{TEXTO_ESTADO[ficha.estado] ?? ficha.estado}</span>
      </div>
      <div className="list" style={{ gap: 8, marginTop: 14, fontSize: 14 }}>
        {dato('Nombre', ficha.nombre)}
        {dato('Correo', ficha.correo ?? 'No indicado')}
        {dato('Teléfono', formatearTelefono(ficha.telefono))}
        {dato('Ciudad', ficha.ciudad.nombre)}
        {ficha.negocio && dato('Negocio', `${ficha.negocio.plan === 'PRO' ? 'Plan Pro' : 'Plan Gratis'}`)}
      </div>
      <h3 style={{ margin: '16px 0 6px' }}>Actividad resumida</h3>
      <div className="list" style={{ gap: 6, fontSize: 14 }} data-actividad>
        {dato('Operaciones completadas', a.operacionesCompletadas)}
        {dato('Operaciones canceladas', a.operacionesCanceladas)}
        {dato('Operaciones en curso', a.operacionesEnCurso)}
        {dato('Kg reciclados', a.kgTotal)}
        {dato('Publicaciones abiertas', a.publicacionesAbiertas)}
        {dato('Ofertas pendientes', a.ofertasPendientes)}
        {dato('Reportes abiertos', a.reportesAbiertos)}
      </div>
      {ficha.estado === 'SUSPENDIDO' && (
        <div className="note" style={{ marginTop: 14 }} data-suspension>
          <span>
            <b>Suspendida</b>
            {ficha.suspendidoEn ? ` el ${formatearFecha(ficha.suspendidoEn)}` : ''}
            {ficha.suspendidoPor ? ` por ${ficha.suspendidoPor}` : ''}. Motivo: {ficha.motivoSuspension}.
          </span>
        </div>
      )}
      {ficha.operacionesEnCurso.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 6px' }}>Operaciones en curso</h3>
          <div className="list" style={{ gap: 6, fontSize: 14 }} data-operaciones-en-curso>
            {ficha.operacionesEnCurso.map((o) => (
              <div key={o.id} className="row sp wr">
                <span>
                  {o.material} · {o.kg} kg · con <b>{o.otraParte}</b>
                </span>
                <span className="mini">
                  {TEXTO_OPERACION[o.estado] ?? o.estado} · {formatearHace(o.desde)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {ficha.historialDeSituacion.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 6px' }}>Cambios de situación</h3>
          <div className="list" style={{ gap: 6, fontSize: 13.5 }}>
            {ficha.historialDeSituacion.map((h, i) => (
              <div key={i}>
                {h.accion === 'SUSPENDER' ? 'Suspendida' : 'Reactivada'} por {h.administrador} ·{' '}
                {formatearFecha(h.fecha)}
                <div className="mini">{h.motivo}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="row g8 wr" style={{ marginTop: 16 }}>
        {ficha.rol !== 'ADMIN' && ficha.estado === 'ACTIVO' && (
          <button type="button" className="btn dn" onClick={() => setModo('suspender')} data-suspender>
            Suspender cuenta
          </button>
        )}
        {ficha.estado === 'SUSPENDIDO' && (
          <button type="button" className="btn p" onClick={() => setModo('reactivar')} data-reactivar>
            Reactivar cuenta
          </button>
        )}
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
      <p className="mini" style={{ marginTop: 10 }}>
        No puedes editar datos de una cuenta ni eliminarla: eso lo hace la propia persona.
      </p>
      {modo && (
        <Decision
          ficha={ficha}
          modo={modo}
          alCerrar={() => setModo(null)}
          alResolver={() => {
            setModo(null);
            alCambiar();
          }}
        />
      )}
    </div>
  );
}

function Contenido() {
  const [rol, setRol] = useState('todos');
  const [situacion, setSituacion] = useState('todas');
  const [ciudad, setCiudad] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [version, setVersion] = useState(0);
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);

  useEffect(() => {
    let vigente = true;
    const consulta = new URLSearchParams({ rol, situacion, pagina: String(pagina) });
    if (ciudad) consulta.set('ciudad', ciudad);
    if (q.trim()) consulta.set('q', q.trim());
    pedir<Lista>(`/admin/usuarios?${consulta.toString()}`)
      .then((r) => vigente && (setLista(r), setError(false)))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [rol, situacion, ciudad, q, pagina, version]);

  useEffect(() => {
    if (!elegida) return;
    let vigente = true;
    pedir<Ficha>(`/admin/usuarios/${elegida}`)
      .then((r) => vigente && setFicha(r))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [elegida, version]);

  const r = lista?.resumen;
  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.porPagina)) : 1;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Gestión de"
        resaltado="usuarios"
        descripcion="Revisa cuentas y suspende con motivo cuando haga falta. No puedes editar sus datos ni sus precios."
      />
      <div className="grid4" style={{ marginBottom: 24 }} data-kpis>
        <Kpi etiqueta="Usuarios" icono="i-user" valor={r?.total ?? '—'} detalle="Cuentas registradas" />
        <Kpi etiqueta="Activos" icono="i-check" valor={r?.activos ?? '—'} detalle="Pueden usar la app" />
        <Kpi etiqueta="Suspendidos" icono="i-alert" valor={r?.suspendidos ?? '—'} detalle="Con motivo registrado" />
        <Kpi etiqueta="Pendientes" icono="i-clock" valor={r?.pendientes ?? '—'} detalle="Sin terminar su registro" />
      </div>
      <div className="cols">
        <section className="panel">
          <div className="row sp wr" style={{ marginBottom: 16, gap: 12 }}>
            <div className="seg" role="group" aria-label="Rol">
              {ROLES.map(([clave, texto]) => (
                <button
                  key={clave}
                  type="button"
                  aria-pressed={rol === clave}
                  onClick={() => {
                    setRol(clave);
                    setPagina(1);
                  }}
                >
                  {texto}
                </button>
              ))}
            </div>
            <div className="row g8 wr">
              <div className="inp" style={{ height: 42 }}>
                <select
                  aria-label="Situación"
                  value={situacion}
                  onChange={(e) => {
                    setSituacion(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="todas">Todas las situaciones</option>
                  <option value="activas">Activos</option>
                  <option value="suspendidas">Suspendidos</option>
                  <option value="pendientes">Pendientes</option>
                </select>
              </div>
              <div className="inp" style={{ height: 42 }}>
                <select
                  aria-label="Ciudad"
                  value={ciudad}
                  onChange={(e) => {
                    setCiudad(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="">Todas las ciudades</option>
                  {(lista?.ciudades ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="inp" style={{ height: 42 }}>
                <input
                  aria-label="Buscar"
                  placeholder="Nombre, correo o teléfono"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPagina(1);
                  }}
                />
              </div>
            </div>
          </div>
          {error && (
            <p className="msg" role="alert">
              No pudimos cargar los usuarios.
            </p>
          )}
          {!lista && !error && <span className="girando" role="status" aria-label="Cargando" />}
          {lista && lista.datos.length === 0 && <EstadoVacio icono="i-search" titulo="Ninguna cuenta coincide" />}
          {lista && lista.datos.length > 0 && (
            <div style={{ overflow: 'auto' }}>
              <table className="tbl" tabIndex={0} data-tabla-usuarios>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Ciudad</th>
                    <th>Registro</th>
                    <th>Actividad</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.datos.map((u) => (
                    <tr key={u.id} data-usuario={u.nombre}>
                      <td>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => {
                            setFicha(null);
                            setElegida(u.id);
                          }}
                        >
                          {u.nombre}
                        </button>
                      </td>
                      <td>{TEXTO_ROL[u.rol]}</td>
                      <td>{u.ciudad.nombre}</td>
                      <td className="mini">{formatearFecha(u.creadoEn)}</td>
                      <td className="mini">{u.actividad ?? '—'}</td>
                      <td>
                        <span className={`pill ${TONO[u.estado] ?? 'grey'}`}>{TEXTO_ESTADO[u.estado] ?? u.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lista && (
            <div className="row sp wr" style={{ marginTop: 12 }}>
              <p className="mini" style={{ margin: 0 }}>
                {lista.total} {lista.total === 1 ? 'cuenta' : 'cuentas'} · página {pagina} de {paginas}
              </p>
              <div className="row g8">
                <button type="button" className="btn sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn sm"
                  disabled={pagina >= paginas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>
        {elegida && ficha && (
          <aside>
            <PanelFicha
              ficha={ficha}
              alCerrar={() => {
                setElegida(null);
                setFicha(null);
              }}
              alCambiar={() => setVersion((v) => v + 1)}
            />
          </aside>
        )}
      </div>
    </>
  );
}

export function UsuariosAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="usr">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
