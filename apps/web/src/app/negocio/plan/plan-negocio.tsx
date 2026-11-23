'use client';

import {
  esquemaSolicitudPlan,
  formatearFecha,
  LARGO_MENSAJE_PLAN,
  TEXTO_ACCION_PLAN,
  TEXTO_SOLICITUD_PLAN,
  type EstadoSolicitudPlan,
} from '@reciclomap/shared';
import { useCallback, useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Campo } from '@/diseno/formulario';
import { ErrorApi, pedir } from '@/sesion/api';

type PlanDelNegocio = {
  plan: 'GRATIS' | 'PRO';
  estado: 'GRATIS' | 'SOLICITADO' | 'PRO';
  desde: string | null;
  hasta: string | null;
  venceEnDias: number | null;
  avisoVenceDias: number;
  solicitud: { id: string; mensaje: string | null; creadaEn: string } | null;
  puedeSolicitar: boolean;
  impedimento: { codigo: string; mensaje: string } | null;
  beneficios: string[];
  historial: Array<{
    id: string;
    accion: keyof typeof TEXTO_ACCION_PLAN;
    desde: string | null;
    hasta: string | null;
    fecha: string;
  }>;
  solicitudes: Array<{ id: string; estado: EstadoSolicitudPlan; creadaEn: string; motivoDecision: string | null }>;
};

const fechaCorta = (texto: string) => formatearFecha(`${texto}T12:00:00Z`);

// Estado del plan del negocio: Gratis, solicitado o Pro hasta una fecha. Sin precios ni cobros; el plan lo activa la administración
export function PlanDelNegocio() {
  const aviso = useAviso();
  const [datos, setDatos] = useState<PlanDelNegocio | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => setDatos(await pedir<PlanDelNegocio>('/mi-negocio/plan')), []);
  useEffect(() => {
    let vigente = true;
    pedir<PlanDelNegocio>('/mi-negocio/plan')
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  if (!datos)
    return (
      <div className="panel" data-panel="plan">
        <span className="girando" role="status" aria-label="Cargando" />
      </div>
    );

  const solicitar = async () => {
    const lectura = esquemaSolicitudPlan.safeParse({ mensaje });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Revisa el mensaje.');
      return;
    }
    setEnviando(true);
    try {
      await pedir('/mi-negocio/plan/solicitud', { cuerpo: lectura.data });
      aviso('Solicitud enviada. Te avisaremos cuando la revisen.');
      setAbierto(false);
      setMensaje('');
      setError(null);
      await cargar();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar tu solicitud.');
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async () => {
    try {
      await pedir('/mi-negocio/plan/solicitud', { metodo: 'DELETE' });
      aviso('Solicitud cancelada');
      await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos cancelar la solicitud.');
      await cargar();
    }
  };

  const textoEstado =
    datos.estado === 'PRO' ? 'Plan Pro' : datos.estado === 'SOLICITADO' ? 'Pro solicitado' : 'Plan Gratis';
  const porVencer = datos.venceEnDias !== null && datos.venceEnDias <= datos.avisoVenceDias;
  return (
    <div className="panel" style={{ marginBottom: 24 }} data-panel="plan" data-estado-plan={datos.estado}>
      <div className="row sp wr">
        <div>
          <span className="kick">Tu plan</span>
          <h2 style={{ margin: '4px 0 0' }}>{datos.plan === 'PRO' ? 'Pro' : 'Gratis'}</h2>
        </div>
        <span
          className={datos.estado === 'PRO' ? 'pill pro' : datos.estado === 'SOLICITADO' ? 'pill warn' : 'pill grey'}
        >
          {textoEstado}
        </span>
      </div>
      {datos.plan === 'PRO' && datos.hasta && (
        <p style={{ margin: '8px 0 0' }} data-vigencia>
          Pro hasta el <b>{fechaCorta(datos.hasta)}</b>
          {datos.venceEnDias !== null &&
            ` · ${datos.venceEnDias === 0 ? 'vence hoy' : `faltan ${datos.venceEnDias} ${datos.venceEnDias === 1 ? 'día' : 'días'}`}`}
        </p>
      )}
      {datos.solicitud && (
        <div className="note" style={{ marginTop: 12 }} data-solicitud>
          <span>
            <b>Solicitud en revisión</b> desde el {formatearFecha(datos.solicitud.creadaEn)}.
            {datos.solicitud.mensaje ? ` Tu mensaje: «${datos.solicitud.mensaje}».` : ''}
          </span>
        </div>
      )}
      <p className="mini" style={{ margin: '8px 0 0' }}>
        Tu semáforo, tu precio y tu demanda son los mismos en ambos planes. Los avisos y sus límites también. El plan
        Pro lo activa la administración; no hay cobros en la app.
      </p>
      <ul style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 14 }} data-beneficios>
        {datos.beneficios.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <div className="row g8 wr" style={{ marginTop: 14 }}>
        {datos.solicitud ? (
          <button type="button" className="btn sm" onClick={() => void cancelar()} data-cancelar-solicitud>
            Cancelar solicitud
          </button>
        ) : (
          <button
            type="button"
            className="btn sm p"
            disabled={!datos.puedeSolicitar}
            onClick={() => setAbierto(true)}
            data-solicitar-pro
          >
            {datos.plan === 'PRO' ? 'Pedir renovación' : 'Solicitar plan Pro'}
          </button>
        )}
      </div>
      {!datos.puedeSolicitar && !datos.solicitud && datos.impedimento && (
        <p className="mini" style={{ margin: '8px 0 0' }} data-impedimento>
          {datos.impedimento.mensaje}
        </p>
      )}
      {porVencer && !datos.solicitud && (
        <p className="mini" style={{ margin: '8px 0 0' }}>
          Tu plan vence pronto. Si quieres seguir, pide la renovación.
        </p>
      )}
      {(datos.historial.length > 0 || datos.solicitudes.length > 0) && (
        <details style={{ marginTop: 14 }} data-historial-plan>
          <summary style={{ cursor: 'pointer', font: '700 14px var(--head)' }}>Historial de tu plan</summary>
          <ul className="list" style={{ marginTop: 8, fontSize: 13.5 }}>
            {datos.historial.map((h) => (
              <li key={h.id}>
                {TEXTO_ACCION_PLAN[h.accion]}
                {h.desde && h.hasta ? ` · del ${fechaCorta(h.desde)} al ${fechaCorta(h.hasta)}` : ''} ·{' '}
                <span className="mini">{formatearFecha(h.fecha)}</span>
              </li>
            ))}
            {datos.solicitudes.map((s) => (
              <li key={s.id}>
                Solicitud {TEXTO_SOLICITUD_PLAN[s.estado].toLowerCase()}
                {s.motivoDecision && s.estado === 'RECHAZADA' ? ` · ${s.motivoDecision}` : ''} ·{' '}
                <span className="mini">{formatearFecha(s.creadaEn)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Ventana
        abierta={abierto}
        alCerrar={() => setAbierto(false)}
        antetitulo="PLAN PRO"
        titulo="Solicitar el plan Pro"
      >
        <p className="mini">
          La administración revisará tu solicitud y la activará con fechas. No hay cobros en la app. Puedes cancelarla
          mientras esté en revisión.
        </p>
        <Campo
          etiqueta="Mensaje"
          opcional
          maxLength={LARGO_MENSAJE_PLAN}
          value={mensaje}
          onChange={(evento) => {
            setMensaje(evento.target.value);
            setError(null);
          }}
          error={error ?? undefined}
        />
        <div className="row g8 wr">
          <button type="button" className="btn p" disabled={enviando} onClick={() => void solicitar()}>
            Enviar solicitud
          </button>
          <button type="button" className="btn" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      </Ventana>
    </div>
  );
}
