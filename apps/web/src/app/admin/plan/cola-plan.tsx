'use client';

import {
  esquemaActivarPlan,
  esquemaMotivoPlan,
  formatearFecha,
  formatearHace,
  TEXTO_SOLICITUD_PLAN,
  type EstadoSolicitudPlan,
} from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Negocio = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  verificado: boolean;
  suspendido: boolean;
  plan: 'GRATIS' | 'PRO';
  desde: string | null;
  hasta: string | null;
};
type Solicitud = {
  id: string;
  estado: EstadoSolicitudPlan;
  mensaje: string | null;
  creadaEn: string;
  atendidaEn: string | null;
  motivoDecision: string | null;
  desde: string | null;
  hasta: string | null;
  negocio: Negocio;
};
type Accion =
  | { tipo: 'aprobar'; solicitud: Solicitud }
  | { tipo: 'rechazar'; solicitud: Solicitud }
  | { tipo: 'activar'; negocio: Negocio }
  | { tipo: 'desactivar'; negocio: Negocio };

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const enDias = (dias: number) =>
  new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const fecha = (texto: string) => formatearFecha(`${texto}T12:00:00Z`);

function Decision({
  accion,
  alCerrar,
  alResolver,
}: {
  accion: Accion | null;
  alCerrar: () => void;
  alResolver: () => void;
}) {
  const aviso = useAviso();
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(enDias(90));
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  if (!accion) return null;
  const conFechas = accion.tipo === 'aprobar' || accion.tipo === 'activar';
  const negocio = 'negocio' in accion ? accion.negocio : accion.solicitud.negocio;
  const titulo = {
    aprobar: 'Aprobar y activar Pro',
    rechazar: 'Rechazar solicitud',
    activar: 'Activar plan Pro',
    desactivar: 'Desactivar plan Pro',
  }[accion.tipo];

  const enviar = async () => {
    const lectura = conFechas
      ? esquemaActivarPlan.safeParse({ desde, hasta, motivo })
      : esquemaMotivoPlan.safeParse({ motivo });
    if (!lectura.success) {
      const nuevos: Record<string, string> = {};
      for (const p of lectura.error.issues) nuevos[String(p.path[0])] ??= p.message;
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    try {
      const ruta =
        accion.tipo === 'aprobar'
          ? `/admin/plan/solicitudes/${accion.solicitud.id}/aprobar`
          : accion.tipo === 'rechazar'
            ? `/admin/plan/solicitudes/${accion.solicitud.id}/rechazar`
            : `/admin/plan/negocios/${accion.negocio.id}/${accion.tipo}`;
      await pedir(ruta, { cuerpo: lectura.data });
      aviso(
        accion.tipo === 'rechazar'
          ? 'Solicitud rechazada'
          : accion.tipo === 'desactivar'
            ? 'Plan desactivado'
            : 'Plan Pro activado',
      );
      alResolver();
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana abierta alCerrar={alCerrar} antetitulo="PLAN PRO" titulo={`${titulo} · ${negocio.nombre}`}>
      {conFechas && (
        <div className="grid2" style={{ gap: 12 }}>
          <Campo
            etiqueta="Inicio"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            error={errores.desde}
          />
          <Campo
            etiqueta="Fin"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            error={errores.hasta}
          />
        </div>
      )}
      <Campo
        etiqueta="Motivo"
        ayuda="Queda en la auditoría. Mínimo 5 letras."
        maxLength={200}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        error={errores.motivo}
      />
      {errores.general && (
        <p className="msg" role="alert">
          {errores.general}
        </p>
      )}
      <div className="row g8 wr">
        <button
          type="button"
          className={accion.tipo === 'rechazar' || accion.tipo === 'desactivar' ? 'btn' : 'btn p'}
          disabled={enviando}
          onClick={() => void enviar()}
        >
          {titulo}
        </button>
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Ventana>
  );
}

function Contenido() {
  const [resueltas, setResueltas] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vigente = true;
    Promise.all([
      pedir<{ datos: Solicitud[] }>(`/admin/plan/solicitudes?estado=${resueltas ? 'resueltas' : 'pendientes'}`),
      pedir<{ datos: Negocio[] }>(`/admin/plan/negocios${busqueda ? `?q=${encodeURIComponent(busqueda)}` : ''}`),
    ])
      .then(([cola, lista]) => {
        if (!vigente) return;
        setSolicitudes(cola.datos);
        setNegocios(lista.datos);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [resueltas, busqueda, version]);

  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Plan"
        resaltado="Pro"
        descripcion="Activas el plan a mano, con fechas y motivo; todo queda en la auditoría. No hay cobros en la app."
      />
      <div className="cols">
        <section className="panel" data-panel="solicitudes">
          <div className="row sp wr" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Solicitudes</h2>
            <div className="seg" role="group" aria-label="Estado de las solicitudes">
              <button type="button" aria-pressed={!resueltas} onClick={() => setResueltas(false)}>
                Pendientes
              </button>
              <button type="button" aria-pressed={resueltas} onClick={() => setResueltas(true)}>
                Resueltas
              </button>
            </div>
          </div>
          {!solicitudes ? (
            <span className="girando" role="status" aria-label="Cargando" />
          ) : solicitudes.length === 0 ? (
            <EstadoVacio
              icono="i-check"
              titulo={resueltas ? 'Sin solicitudes resueltas' : 'Sin solicitudes pendientes'}
            />
          ) : (
            <div className="list">
              {solicitudes.map((s) => (
                <div
                  key={s.id}
                  data-solicitud={s.estado}
                  className="row g16 wr"
                  style={{ border: '2px solid var(--ink)', borderRadius: 16, padding: '12px 14px' }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <b style={{ font: '800 16px var(--head)' }}>{s.negocio.nombre}</b>{' '}
                    <span
                      className={
                        s.estado === 'PENDIENTE' ? 'pill warn' : s.estado === 'APROBADA' ? 'pill open' : 'pill grey'
                      }
                    >
                      {TEXTO_SOLICITUD_PLAN[s.estado]}
                    </span>
                    <div className="mini">
                      {s.negocio.tipo === 'CENTRO' ? 'Centro de acopio' : 'Comprador móvil'} ·{' '}
                      {formatearHace(s.creadaEn)}
                      {s.negocio.plan === 'PRO' && s.negocio.hasta ? ` · Pro hasta ${fecha(s.negocio.hasta)}` : ''}
                    </div>
                    {s.mensaje && <div style={{ marginTop: 4, fontSize: 14 }}>«{s.mensaje}»</div>}
                    {s.estado === 'APROBADA' && s.desde && s.hasta && (
                      <div className="mini">
                        Del {fecha(s.desde)} al {fecha(s.hasta)}
                      </div>
                    )}
                    {s.motivoDecision && <div className="mini">Motivo: {s.motivoDecision}</div>}
                    {(!s.negocio.verificado || s.negocio.suspendido) && s.estado === 'PENDIENTE' && (
                      <div className="mini">
                        {s.negocio.suspendido ? 'Cuenta suspendida' : 'Negocio sin verificar'}: no se puede activar.
                      </div>
                    )}
                  </div>
                  {s.estado === 'PENDIENTE' && (
                    <div className="row g8">
                      <button
                        type="button"
                        className="btn sm p"
                        disabled={!s.negocio.verificado || s.negocio.suspendido}
                        onClick={() => setAccion({ tipo: 'aprobar', solicitud: s })}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setAccion({ tipo: 'rechazar', solicitud: s })}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="panel" data-panel="negocios">
          <h3>Activar o desactivar por negocio</h3>
          <Campo
            etiqueta="Buscar negocio"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre del negocio"
          />
          <div className="list" style={{ marginTop: 12, gap: 8 }}>
            {(negocios ?? []).map((n) => (
              <div
                key={n.id}
                data-negocio={n.nombre}
                className="row g8 wr"
                style={{ borderBottom: '1.5px solid var(--line)', paddingBottom: 8 }}
              >
                <div style={{ flex: 1, minWidth: 140 }}>
                  <b>{n.nombre}</b>{' '}
                  <span className={n.plan === 'PRO' ? 'pill pro' : 'pill grey'}>
                    {n.plan === 'PRO' ? 'Pro' : 'Gratis'}
                  </span>
                  {n.plan === 'PRO' && n.hasta && <div className="mini">hasta {fecha(n.hasta)}</div>}
                </div>
                {n.plan === 'PRO' ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setAccion({ tipo: 'desactivar', negocio: n })}
                  >
                    Desactivar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm p"
                    disabled={n.suspendido}
                    onClick={() => setAccion({ tipo: 'activar', negocio: n })}
                  >
                    Activar
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
      <Decision
        key={accion ? `${accion.tipo}-${'solicitud' in accion ? accion.solicitud.id : accion.negocio.id}` : 'cerrada'}
        accion={accion}
        alCerrar={() => setAccion(null)}
        alResolver={() => {
          setAccion(null);
          setVersion((v) => v + 1);
        }}
      />
    </>
  );
}

export function ColaPlan() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="rul">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
