'use client';

import {
  enlaceWhatsApp,
  formatearFecha,
  formatearFechaHora,
  formatearTelefono,
  MOTIVOS_CANCELACION_OPERACION,
  TEXTO_FRANJA,
} from '@reciclomap/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Icono } from '@/diseno/icono';
import { TEXTO_VEHICULO } from '@/mapa/resultados';
import { MarcoApp } from '@/navegacion/marco-app';
import { useAlLlegarAviso } from '@/notificaciones/en-vivo';
import { RUTAS } from '@/navegacion/rutas';
import { DialogoMotivo, DialogoRecibi, LineaOperacion, PildoraOperacion } from '@/operaciones/piezas';
import { copiarPublicacion } from '@/publicaciones/copiar';
import { FichaMaterial, kilos, soles } from '@/publicaciones/piezas';
import type { Operacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

type Dialogo = 'cancelar' | 'noConforme' | 'incidencia' | 'entregar' | 'recibi' | null;

const SUBTITULO = (o: Operacion): string => {
  if (o.estado === 'CANCELADA')
    return `Operación cancelada${o.cancelacion?.motivo ? `: ${o.cancelacion.motivo}` : '.'}`;
  if (o.enDisputa)
    return 'Hay una incidencia abierta. Un administrador la revisará; mientras tanto el plazo está detenido.';
  const reciclador = o.rol === 'RECICLADOR';
  switch (o.estado) {
    case 'ACEPTADA':
      return reciclador
        ? 'Define el punto de encuentro y coordinen por WhatsApp.'
        : 'El reciclador definirá el punto de encuentro.';
    case 'EN_COORDINACION':
      return reciclador
        ? 'Cuando entregues el material, márcalo aquí.'
        : 'Acuerden por WhatsApp; el reciclador marcará la entrega.';
    case 'ENTREGADA':
      return reciclador
        ? 'Entregaste el material. Falta que confirmen los kilos.'
        : 'Confirma la recepción con los kilos recibidos.';
    case 'CONFIRMADA':
      return reciclador
        ? 'Revisa los kilos confirmados y da tu conformidad.'
        : 'Confirmaste los kilos. Falta la conformidad del reciclador.';
    default:
      return 'Operación cerrada: puntos sumados y calificaciones habilitadas.';
  }
};

function Acciones({
  o,
  abrir,
  recargar,
}: {
  o: Operacion;
  abrir: (d: Dialogo) => void;
  recargar: () => Promise<void>;
}) {
  const aviso = useAviso();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const conforme = async () => {
    setEnviando(true);
    try {
      const resultado = await pedir<Operacion>(`/operaciones/${o.id}/conforme`, { cuerpo: {} });
      aviso(`Operación completada: +${resultado.puntosGanados ?? 0} puntos.`);
      await recargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos completar la operación.');
    } finally {
      setEnviando(false);
    }
  };
  const volverAPublicar = async () => {
    const resultado = await copiarPublicacion(
      { id: o.publicacionId, material: o.material, kg: o.kg },
      'duplicar',
    ).catch((causa: unknown) => {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos volver a publicar.');
      return null;
    });
    if (!resultado) return;
    if (resultado.tipo === 'sin-ubicacion') router.push(resultado.ruta);
    else {
      aviso('Tu material está publicado de nuevo por 7 días.');
      router.push(`${RUTAS.misPublicaciones}/${resultado.id}`);
    }
  };
  const a = o.acciones;

  return (
    <div className="stack" style={{ gap: 12 }} data-panel="acciones">
      {o.estado === 'COMPLETADA' && o.rol === 'RECICLADOR' && o.puntos !== null && (
        <div
          style={{
            background: 'var(--lime)',
            border: '2px solid var(--ink)',
            borderRadius: 18,
            padding: 16,
            display: 'flex',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <span className="ico" style={{ background: '#fff' }}>
            <Icono nombre="i-trophy" />
          </span>
          <div>
            <b style={{ font: '800 22px var(--head)', color: 'var(--ink)' }}>+{o.puntos} puntos</b>
            <div className="mini" style={{ color: 'var(--ink)' }}>
              {o.kgFinal !== null ? `${kilos(o.kgFinal)} kg reciclados` : ''}
              {o.completadaPorPlazo ? ' · se completó al cumplirse 72 horas' : ''}
            </div>
          </div>
        </div>
      )}
      {o.incidencia && (
        <div className={o.incidencia.estado === 'RESUELTO' ? 'note' : 'note warn'} role="status">
          <Icono nombre="i-alert" />
          <span>
            <b>
              {o.incidencia.motivo === 'NO_CONFORME'
                ? 'Incidencia por los kilos confirmados'
                : 'Incidencia por entrega sin confirmar'}
            </b>
            {o.incidencia.estado === 'RESUELTO'
              ? `. Resuelta: ${o.incidencia.decision ?? ''}`
              : o.incidencia.correccionPedida
                ? `. Un administrador pidió al comprador corregir los kilos: ${o.incidencia.decision ?? ''}`
                : '. Un administrador la revisará. Mientras tanto, la operación no se cierra sola.'}
          </span>
        </div>
      )}
      {a.includes('coordinar') && (
        <Link className="btn p" href={`/operaciones/${o.id}/coordinar`}>
          <Icono nombre="i-pin" />
          {o.coordinacion ? 'Cambiar el punto de encuentro' : 'Definir el punto de encuentro'}
        </Link>
      )}
      {a.includes('entregar') && (
        <button type="button" className="btn p" onClick={() => abrir('entregar')}>
          <Icono nombre="i-check" />
          Ya entregué el material
        </button>
      )}
      {(a.includes('confirmar') || a.includes('corregirKilos')) && (
        <button type="button" className="btn p" onClick={() => abrir('recibi')}>
          <Icono nombre="i-check" />
          {a.includes('corregirKilos') ? 'Corregir los kilos recibidos' : 'Recibí el material'}
        </button>
      )}
      {a.includes('conforme') && (
        <>
          <p style={{ margin: 0 }}>
            {o.contraparte.nombre} confirmó <b>{kilos(o.kgFinal ?? 0)} kg</b> por <b>{soles(o.montoFinal ?? 0)}</b>.
            ¿Estás conforme?
          </p>
          {o.plazos.conformidadHasta && (
            <span className="mini">
              Si no respondes antes del {formatearFechaHora(o.plazos.conformidadHasta)}, se completa sola.
            </span>
          )}
          <div className="row g8 wr">
            <button type="button" className="btn p" disabled={enviando} onClick={() => void conforme()}>
              <Icono nombre="i-check" />
              Conforme
            </button>
            <button type="button" className="btn" onClick={() => abrir('noConforme')}>
              No conforme
            </button>
          </div>
        </>
      )}
      {a.includes('reportarProblema') && (
        <Link
          className="mini"
          href={`${RUTAS.reportarProblema}?operacion=${o.id}`}
          data-hubo-problema
          style={{ color: 'var(--deep)', fontWeight: 700 }}
        >
          ¿Hubo un problema con esta operación?
        </Link>
      )}
      {a.includes('abrirIncidencia') && (
        <>
          <p className="mini" style={{ margin: 0 }}>
            Pasaron 72 horas y {o.contraparte.nombre} no confirmó la recepción. Puedes abrir una incidencia para que un
            administrador la revise.
          </p>
          <button type="button" className="btn" onClick={() => abrir('incidencia')}>
            Abrir una incidencia
          </button>
        </>
      )}
      {a.includes('calificar') && (
        <Link className="btn p" href={`/operaciones/${o.id}/calificar`}>
          <Icono nombre="i-star" />
          Calificar a {o.contraparte.nombre}
        </Link>
      )}
      {o.miCalificacion && (
        <span className="mini">Ya calificaste esta operación con {o.miCalificacion.estrellas} estrellas.</span>
      )}
      {a.includes('volverAPublicar') && (
        <button type="button" className="btn p" onClick={() => void volverAPublicar()}>
          Volver a publicar
        </button>
      )}
      {a.includes('cancelar') && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => abrir('cancelar')}
          style={{ alignSelf: 'flex-start' }}
        >
          Cancelar operación
        </button>
      )}
      {a.length === 0 && !o.miCalificacion && o.estado !== 'COMPLETADA' && o.estado !== 'CANCELADA' && (
        <p className="mini" style={{ margin: 0 }}>
          No hay nada que hacer por ahora. Te avisaremos cuando {o.contraparte.nombre} avance.
        </p>
      )}
    </div>
  );
}

function Contenido({ id }: { id: string }) {
  const aviso = useAviso();
  const { usuario } = useSesion();
  const [o, setO] = useState<Operacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const recargar = useCallback(async () => {
    setO(await pedir<Operacion>(`/operaciones/${id}`));
  }, [id]);

  useEffect(() => {
    let vigente = true;
    pedir<Operacion>(`/operaciones/${id}`)
      .then((respuesta) => vigente && setO(respuesta))
      .catch(
        (causa: unknown) => vigente && setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cargarla.'),
      );
    return () => {
      vigente = false;
    };
  }, [id]);

  useAlLlegarAviso(useCallback(() => void recargar().catch(() => undefined), [recargar]));

  const accion = (ruta: string, mensaje: string) => async (cuerpo: Record<string, string>) => {
    await pedir(`/operaciones/${id}/${ruta}`, { cuerpo });
    aviso(mensaje);
    setDialogo(null);
    await recargar();
  };

  if (error) {
    return (
      <div className="note warn" role="alert">
        <Icono nombre="i-alert" />
        <span>{error}</span>
      </div>
    );
  }
  if (!o) return <span className="girando" aria-label="Cargando" />;
  const reciclador = o.rol === 'RECICLADOR';
  const otra = o.contraparte;
  const saludo = reciclador
    ? `Hola, soy quien aceptó tu oferta por ${kilos(o.kg)} kg de ${o.material.nombre} en RecicloMap. ¿Coordinamos la entrega?`
    : `Hola, gracias por aceptar mi oferta por tus ${kilos(o.kg)} kg de ${o.material.nombre} en RecicloMap. ¿Coordinamos la entrega?`;
  const tipoOtra =
    otra.tipo === 'RECICLADOR'
      ? 'Reciclador'
      : otra.tipo === 'CENTRO'
        ? 'Centro de acopio'
        : `${TEXTO_VEHICULO[otra.vehiculo ?? ''] ?? 'Vehículo'} · comprador móvil`;
  const c = o.coordinacion;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link
          href={
            reciclador ? RUTAS.historial : usuario?.rol === 'CENTRO' ? RUTAS.historialCompras : RUTAS.compradorCompras
          }
          className="btn sm"
          style={{ height: 36 }}
        >
          <Icono nombre="i-arrow-left" tamano="sm" />
          {reciclador ? 'Mi historial' : usuario?.rol === 'CENTRO' ? 'Historial de compras' : 'Mis compras'}
        </Link>
      </div>
      <div className="ph">
        <div>
          <span className="kick">Seguimiento de la operación</span>
          <h1>
            {o.material.nombre} · {kilos(o.kg)} kg <u>con {otra.nombre}</u>
          </h1>
          <p>{SUBTITULO(o)}</p>
        </div>
        <PildoraOperacion estado={o.estado} enDisputa={o.enDisputa} />
      </div>
      <div className="cols">
        <section className="stack">
          <div className="panel">
            <h2>Acciones</h2>
            <Acciones o={o} abrir={setDialogo} recargar={recargar} />
          </div>
          <div className="panel">
            <h2>Estado</h2>
            {o.estado === 'CANCELADA' ? (
              <p>
                Cancelada el {formatearFecha(o.fechas.cancelada ?? o.fechas.aceptada ?? new Date())}
                {o.cancelacion?.por === 'NEGOCIO'
                  ? ' por el comprador'
                  : o.cancelacion?.por === 'RECICLADOR'
                    ? ' por el reciclador'
                    : ' por la administración'}
                {o.cancelacion?.motivo ? `. Motivo: ${o.cancelacion.motivo}` : ''}.
              </p>
            ) : (
              <LineaOperacion operacion={o} />
            )}
          </div>
        </section>
        <aside className="stack" style={{ position: 'sticky', top: 92 }}>
          <div className="panel" data-contraparte>
            <h3>{reciclador ? 'Comprador' : 'Reciclador'}</h3>
            <div className="row g16">
              <span className={otra.tipo === 'RECICLADOR' ? 'ico l' : 'ico'} aria-hidden="true">
                <Icono
                  nombre={otra.tipo === 'RECICLADOR' ? 'i-user' : otra.tipo === 'CENTRO' ? 'i-store' : 'i-truck'}
                />
              </span>
              <div>
                <b style={{ font: '700 17px var(--head)', color: 'var(--ink)' }}>{otra.nombre}</b>
                <div className="mini">{tipoOtra}</div>
              </div>
            </div>
            {o.estado !== 'CANCELADA' && (
              <a
                className="btn p"
                style={{ width: '100%', marginTop: 14 }}
                href={enlaceWhatsApp(otra.whatsapp, saludo)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icono nombre="i-whatsapp" />
                WhatsApp {formatearTelefono(otra.whatsapp)}
              </a>
            )}
            {otra.negocioId && (
              <Link
                className="btn ghost"
                style={{ width: '100%', marginTop: 8 }}
                href={`/negocios/${otra.negocioId}/resenas`}
              >
                Ver sus reseñas
              </Link>
            )}
          </div>
          <div className="panel" data-panel="punto">
            <h3>Punto de encuentro</h3>
            {c ? (
              <div className="stack" style={{ gap: 6, fontSize: 14 }}>
                <span className="row g8" style={{ alignItems: 'flex-start' }}>
                  <Icono nombre="i-pin" tamano="sm" />
                  <b>{c.tipo === 'LOCAL_DEL_CENTRO' ? `En el local: ${c.direccionDelLocal ?? ''}` : c.referencia}</b>
                </span>
                {c.pin && (
                  <a
                    className="mini"
                    href={`https://www.google.com/maps/search/?api=1&query=${c.pin.lat},${c.pin.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver el punto marcado en el mapa
                  </a>
                )}
                {(c.dia || c.franja) && (
                  <span className="mini">
                    Propuesto: {c.dia ? formatearFecha(`${c.dia}T12:00:00-05:00`) : ''}
                    {c.franja ? ` · ${TEXTO_FRANJA[c.franja].toLowerCase()}` : ''}
                  </span>
                )}
                {c.mensaje && <span className="mini">“{c.mensaje}”</span>}
              </div>
            ) : (
              <p className="mini">
                {reciclador
                  ? 'Aún no lo definiste. Tu ubicación no se comparte: tú eliges dónde se encuentran.'
                  : 'El reciclador aún no lo define.'}
              </p>
            )}
          </div>
          <div className="panel">
            <h3>Resumen</h3>
            <div className="stack" style={{ gap: 9, fontSize: 14 }}>
              <div className="row sp">
                <span>Material</span>
                <b className="row g8">
                  <FichaMaterial codigo={o.material.codigo} tamano={26} /> {o.material.nombre}
                </b>
              </div>
              <div className="row sp">
                <span>Kilos publicados</span>
                <b>{kilos(o.kg)} kg</b>
              </div>
              {o.kgFinal !== null && (
                <div className="row sp">
                  <span>Kilos recibidos</span>
                  <b>{kilos(o.kgFinal)} kg</b>
                </div>
              )}
              <div className="row sp">
                <span>Precio acordado</span>
                <b className="mono">{soles(o.precioKg)}/kg</b>
              </div>
              <div className="row sp">
                <span>{o.montoFinal ? 'Monto final' : 'Total estimado'}</span>
                <b className="mono" style={{ fontSize: 18 }}>
                  {soles(o.montoFinal ?? o.total)}
                </b>
              </div>
            </div>
            <div className="note" style={{ marginTop: 12 }}>
              <Icono nombre="i-info" />
              <span>RecicloMap no procesa pagos. El pago se acuerda directamente entre las partes.</span>
            </div>
          </div>
        </aside>
      </div>

      <Ventana
        abierta={dialogo === 'entregar'}
        alCerrar={() => setDialogo(null)}
        antetitulo="CONFIRMA"
        titulo="¿Ya entregaste el material?"
      >
        <p className="mini">{otra.nombre} confirmará los kilos que recibió. Tú no escribes el peso.</p>
        <button
          type="button"
          className="btn p"
          onClick={() =>
            void accion(
              'entregar',
              'Listo: avisamos al comprador para que confirme.',
            )({}).catch((causa: unknown) =>
              aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos marcar la entrega.'),
            )
          }
        >
          Sí, ya entregué
        </button>
        <button type="button" className="btn ghost" onClick={() => setDialogo(null)}>
          Volver
        </button>
      </Ventana>
      {dialogo === 'recibi' && (
        <DialogoRecibi
          operacion={o}
          corrigiendo={o.acciones.includes('corregirKilos')}
          alCerrar={() => setDialogo(null)}
          alConfirmar={() => {
            setDialogo(null);
            void recargar();
          }}
        />
      )}
      <DialogoMotivo
        abierto={dialogo === 'cancelar'}
        antetitulo="CANCELAR OPERACIÓN"
        titulo="¿Por qué cancelas?"
        explicacion="La publicación quedará cancelada y avisaremos a la otra parte."
        opciones={MOTIVOS_CANCELACION_OPERACION}
        boton="Cancelar operación"
        peligro
        alCerrar={() => setDialogo(null)}
        alEnviar={accion('cancelar', 'Operación cancelada')}
      />
      <DialogoMotivo
        abierto={dialogo === 'noConforme'}
        antetitulo="NO CONFORME"
        titulo="¿Qué no está bien?"
        explicacion="Se abrirá una incidencia y el plazo se detendrá hasta que un administrador la revise."
        boton="Enviar"
        campo="detalle"
        alCerrar={() => setDialogo(null)}
        alEnviar={accion('no-conforme', 'Incidencia abierta. Un administrador la revisará.')}
      />
      <DialogoMotivo
        abierto={dialogo === 'incidencia'}
        antetitulo="ABRIR INCIDENCIA"
        titulo="¿Qué pasó con la entrega?"
        boton="Abrir incidencia"
        campo="detalle"
        alCerrar={() => setDialogo(null)}
        alEnviar={accion('incidencia', 'Incidencia abierta. Un administrador la revisará.')}
      />
    </>
  );
}

export function Seguimiento({ id }: { id: string }) {
  const { usuario } = useSesion();
  return (
    <Protegida roles={['RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa={usuario?.rol === 'RECICLADOR' ? 'his' : usuario?.rol === 'COMPRADOR_MOVIL' ? 'com' : 'pubs'}>
        <Contenido id={id} />
      </MarcoApp>
    </Protegida>
  );
}
