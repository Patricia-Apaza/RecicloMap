'use client';

import { BANNER_MAXIMO, formatearHace, MENSAJE_MANTENIMIENTO_MAXIMO } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { Nota } from '@/diseno/bloques';
import { Campo, Interruptor } from '@/diseno/formulario';
import { pedir } from '@/sesion/api';
import { VentanaMotivo } from '../comun';

type Controles = {
  banner: { texto: string | null; desde: string | null; hasta: string | null };
  registro: { reciclador: boolean; negocio: boolean };
  mantenimiento: { activo: boolean; mensaje: string | null; desde: string | null };
  advertenciasMantenimiento: { cambioDeMesEn24h: boolean; planesQueVencenEn24h: number };
  recientes: Array<{ accion: string; motivo: string | null; cuando: string; administrador: string }>;
  mantenimientos: Array<{ desde: string; hasta: string | null; plazosDevueltos: boolean }>;
};
type Accion =
  | { tipo: 'banner' }
  | { tipo: 'retirar-banner' }
  | { tipo: 'registro'; rol: 'reciclador' | 'negocio'; abierto: boolean }
  | { tipo: 'mantenimiento'; activar: boolean };

const TEXTO_ACCION: Record<string, string> = {
  BANNER: 'Aviso global',
  REGISTRO: 'Registro',
  MANTENIMIENTO: 'Mantenimiento',
};
// Los campos de fecha y hora se escriben en hora de Lima
const aIso = (local: string) => `${local}:00-05:00`;
const aLocal = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 16) : '';

// Controles de la pantalla 66: aviso global, registro abierto o cerrado y modo mantenimiento
export function ControlesPlataforma() {
  const notificar = useAviso();
  const [datos, setDatos] = useState<Controles | null>(null);
  const [version, setVersion] = useState(0);
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);

  useEffect(() => {
    let vigente = true;
    pedir<Controles>('/admin/controles')
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setTexto(r.banner.texto ?? '');
        setDesde(aLocal(r.banner.desde));
        setHasta(aLocal(r.banner.hasta));
        setMensaje(r.mantenimiento.mensaje ?? '');
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [version]);

  const terminar = (m: string) => {
    notificar(m);
    setAccion(null);
    setVersion((v) => v + 1);
  };

  const preparar = (siguiente: Accion) => {
    if (siguiente.tipo === 'banner') {
      if (!texto.trim()) return setError('Escribe el aviso.');
      if (!desde || !hasta) return setError('Indica cuándo empieza y cuándo termina.');
      if (new Date(aIso(hasta)) <= new Date(aIso(desde))) return setError('Debe terminar después de empezar.');
    }
    if (siguiente.tipo === 'mantenimiento' && siguiente.activar && mensaje.trim().length < 5) {
      return setError('Escribe el mensaje que verá la gente.');
    }
    setError(null);
    setAccion(siguiente);
  };

  if (!datos) return <span className="girando" role="status" aria-label="Cargando los controles" />;
  return (
    <>
      <section className="panel" data-control="banner">
        <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Aviso global</h2>
        <p className="mini" style={{ marginTop: 0 }}>
          Un texto corto que ve todo el mundo, incluso quien no tiene cuenta, entre las fechas que elijas. Cada persona
          puede cerrarlo.
        </p>
        <Campo
          etiqueta="Texto del aviso"
          maxLength={BANNER_MAXIMO}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          ayuda={`${texto.length} de ${BANNER_MAXIMO} caracteres`}
        />
        <div className="grid2" style={{ gap: 12 }}>
          <Campo
            etiqueta="Empieza (hora de Lima)"
            type="datetime-local"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <Campo
            etiqueta="Termina (hora de Lima)"
            type="datetime-local"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        {error && accion === null && (
          <p className="mini" role="alert" style={{ color: 'var(--red, #b3261e)' }}>
            {error}
          </p>
        )}
        <div className="row g8 wr">
          <button type="button" className="btn p" onClick={() => preparar({ tipo: 'banner' })}>
            Publicar aviso
          </button>
          {datos.banner.texto && (
            <button type="button" className="btn dn" onClick={() => setAccion({ tipo: 'retirar-banner' })}>
              Retirar aviso
            </button>
          )}
        </div>
      </section>

      <section className="panel" data-control="registro">
        <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Registro de cuentas nuevas</h2>
        <p className="mini" style={{ marginTop: 0 }}>
          Cierra o abre el registro de cada rol por separado (incluye el registro con Google). Las cuentas que ya
          existen no se afectan; quien intente registrarse verá un mensaje claro.
        </p>
        <div className="stack" style={{ gap: 10 }}>
          <Interruptor
            etiqueta="Registro de recicladores abierto"
            marcado={datos.registro.reciclador}
            alCambiar={() => setAccion({ tipo: 'registro', rol: 'reciclador', abierto: !datos.registro.reciclador })}
          />
          <Interruptor
            etiqueta="Registro de negocios abierto"
            marcado={datos.registro.negocio}
            alCambiar={() => setAccion({ tipo: 'registro', rol: 'negocio', abierto: !datos.registro.negocio })}
          />
        </div>
      </section>

      <section className="panel" data-control="mantenimiento">
        <div className="row sp wr">
          <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Modo mantenimiento</h2>
          <span className={`pill ${datos.mantenimiento.activo ? 'closed' : 'open'}`}>
            {datos.mantenimiento.activo ? 'Activo: solo lectura' : 'Apagado'}
          </span>
        </div>
        <Nota>
          En mantenimiento todos pueden mirar, pero solo la administración puede cambiar cosas. Los plazos no corren: al
          terminar, cada plazo vigente se corre lo que duró el mantenimiento (se redondea hacia arriba a horas
          completas), así nadie pierde un plazo, un premio ni una reclamación. Las tareas automáticas se detienen
          mientras tanto.
        </Nota>
        {!datos.mantenimiento.activo &&
          (datos.advertenciasMantenimiento.cambioDeMesEn24h ||
            datos.advertenciasMantenimiento.planesQueVencenEn24h > 0) && (
            <div className="panel" role="note" data-advertencia-mantenimiento>
              <strong>Ojo con el calendario</strong>
              {datos.advertenciasMantenimiento.cambioDeMesEn24h && (
                <p className="mini">
                  Estás en las últimas 24 horas del mes. El cambio de mes no se corre durante el mantenimiento: los
                  desafíos nuevos empezarán a su hora aunque la plataforma esté en solo lectura.
                </p>
              )}
              {datos.advertenciasMantenimiento.planesQueVencenEn24h > 0 && (
                <p className="mini">
                  {datos.advertenciasMantenimiento.planesQueVencenEn24h === 1
                    ? 'Hay 1 plan Pro que vence'
                    : `Hay ${datos.advertenciasMantenimiento.planesQueVencenEn24h} planes Pro que vencen`}{' '}
                  en las próximas 24 horas. Las fechas del plan Pro no se corren durante el mantenimiento.
                </p>
              )}
            </div>
          )}
        <Campo
          etiqueta="Mensaje para la gente"
          maxLength={MENSAJE_MANTENIMIENTO_MAXIMO}
          value={mensaje}
          disabled={datos.mantenimiento.activo}
          onChange={(e) => {
            setMensaje(e.target.value);
            setError(null);
          }}
          ayuda="Explica qué pasa y cuándo vuelve."
        />
        {error && accion === null && datos.mantenimiento.activo === false && (
          <p className="mini" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className={datos.mantenimiento.activo ? 'btn p' : 'btn dn'}
          onClick={() => preparar({ tipo: 'mantenimiento', activar: !datos.mantenimiento.activo })}
        >
          {datos.mantenimiento.activo ? 'Terminar mantenimiento' : 'Activar mantenimiento'}
        </button>
      </section>

      <section className="panel" data-historial-controles>
        <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Controles recientes</h2>
        {datos.recientes.length === 0 && <p className="mini">Aún no hay cambios.</p>}
        <div className="list">
          {datos.recientes.map((r, i) => (
            <div key={`${r.accion}-${r.cuando}-${i}`} className="mini">
              <b>{TEXTO_ACCION[r.accion] ?? r.accion}</b> · {r.administrador} · {formatearHace(r.cuando)}. Motivo:{' '}
              {r.motivo}
            </div>
          ))}
        </div>
      </section>

      {accion?.tipo === 'banner' && (
        <VentanaMotivo
          antetitulo="AVISO GLOBAL"
          titulo="Publicar el aviso"
          texto={`Lo verá todo el mundo: «${texto}»`}
          textoBoton="Publicar"
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/controles/banner', {
              metodo: 'PUT',
              cuerpo: { texto: texto.trim(), desde: aIso(desde), hasta: aIso(hasta), motivo },
            });
            terminar('Aviso publicado');
          }}
        />
      )}
      {accion?.tipo === 'retirar-banner' && (
        <VentanaMotivo
          antetitulo="AVISO GLOBAL"
          titulo="Retirar el aviso"
          texto="Deja de verse para todos."
          textoBoton="Retirar"
          peligro
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/controles/banner', { metodo: 'PUT', cuerpo: { texto: null, motivo } });
            terminar('Aviso retirado');
          }}
        />
      )}
      {accion?.tipo === 'registro' && (
        <VentanaMotivo
          antetitulo="REGISTRO"
          titulo={`${accion.abierto ? 'Abrir' : 'Cerrar'} el registro de ${accion.rol === 'reciclador' ? 'recicladores' : 'negocios'}`}
          texto={
            accion.abierto
              ? 'Las personas nuevas podrán crear su cuenta.'
              : 'Quien intente registrarse verá un mensaje claro. Las cuentas existentes no se afectan.'
          }
          textoBoton={accion.abierto ? 'Abrir registro' : 'Cerrar registro'}
          peligro={!accion.abierto}
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/controles/registro', {
              metodo: 'PUT',
              cuerpo: { [accion.rol]: accion.abierto, motivo },
            });
            terminar(accion.abierto ? 'Registro abierto' : 'Registro cerrado');
          }}
        />
      )}
      {accion?.tipo === 'mantenimiento' && (
        <VentanaMotivo
          antetitulo="MANTENIMIENTO"
          titulo={accion.activar ? 'Activar el mantenimiento' : 'Terminar el mantenimiento'}
          texto={
            accion.activar
              ? `Todos pasan a solo lectura menos la administración. Verán: «${mensaje}». Los plazos no corren.`
              : 'Todos vuelven a escribir y los plazos vigentes se corren lo que duró el mantenimiento.'
          }
          textoBoton={accion.activar ? 'Activar mantenimiento' : 'Terminar mantenimiento'}
          peligro={accion.activar}
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/controles/mantenimiento', {
              metodo: 'PUT',
              cuerpo: {
                activo: accion.activar,
                ...(accion.activar ? { mensaje: mensaje.trim() } : {}),
                motivo,
                confirmar: true,
              },
            });
            terminar(accion.activar ? 'Mantenimiento activado' : 'Mantenimiento terminado');
          }}
        />
      )}
    </>
  );
}
