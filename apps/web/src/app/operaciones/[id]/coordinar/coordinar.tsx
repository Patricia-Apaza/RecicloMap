'use client';

import '@/acceso/acceso.css';
import { esquemaCoordinar, type Franja, FRANJAS, TEXTO_FRANJA } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { type Punto, SelectorPin } from '@/mapa/selector-pin';
import { MarcoApp } from '@/navegacion/marco-app';
import { kilos, soles } from '@/publicaciones/piezas';
import type { Operacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

const diaEnLima = (desplazamiento: number) =>
  new Date(Date.now() + desplazamiento * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const DIAS = [
  { valor: diaEnLima(0), texto: 'Hoy' },
  { valor: diaEnLima(1), texto: 'Mañana' },
  { valor: diaEnLima(2), texto: 'Pasado mañana' },
];
const LLEVA = [
  'Material seco y sin tapas ni etiquetas',
  'Separado por tipo (PET, cartón, metal)',
  'Costales o bolsas resistentes',
  'Tu celular con batería para coordinar',
];

// Pantalla 25: el punto de encuentro lo elige el reciclador; su ubicación nunca se comparte ni se precarga (C3)
function Formulario({ o }: { o: Operacion }) {
  const aviso = useAviso();
  const router = useRouter();
  const { configuracion } = useConfiguracionPublica();
  const hayMapa = Boolean(configuracion?.mapa);
  const c = o.coordinacion;
  const [tipo, setTipo] = useState<'LOCAL_DEL_CENTRO' | 'REFERENCIA'>(
    c?.tipo ?? (o.puedeEncontrarseEnElLocal ? 'LOCAL_DEL_CENTRO' : 'REFERENCIA'),
  );
  const [referencia, setReferencia] = useState(c?.referencia ?? '');
  const [pin, setPin] = useState<Punto | null>(c?.pin ?? null);
  const [dia, setDia] = useState<string | null>(c?.dia ?? DIAS[0]!.valor);
  const [franja, setFranja] = useState<Franja | null>(c?.franja ?? 'TARDE');
  const [mensaje, setMensaje] = useState(c?.mensaje ?? '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const lectura = esquemaCoordinar.safeParse({
      tipo,
      referencia: tipo === 'REFERENCIA' ? referencia : null,
      pin: tipo === 'REFERENCIA' ? pin : null,
      dia,
      franja,
      mensaje,
    });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    setEnviando(true);
    try {
      await pedir(`/operaciones/${o.id}/coordinar`, { cuerpo: lectura.data });
      aviso(`Punto de encuentro enviado a ${o.contraparte.nombre}.`);
      router.push(`/operaciones/${o.id}`);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el punto de encuentro.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Coordinación"
        titulo="Ponte de acuerdo con"
        resaltado={o.contraparte.nombre}
        descripcion="Aceptaste su oferta: ahora pueden coordinar por WhatsApp. Tu ubicación no se comparte; tú eliges dónde se encuentran."
        acciones={
          <Link className="btn ghost" href={`/operaciones/${o.id}`}>
            Ver seguimiento
          </Link>
        }
      />
      <form className="cols" onSubmit={(e) => void enviar(e)} noValidate>
        <section className="stack">
          <div className="panel">
            <h2>
              Acuerdo{' '}
              <small>
                {o.material.nombre} · {kilos(o.kg)} kg
              </small>
            </h2>
            <div className="stack" style={{ gap: 0, fontSize: 14.5 }}>
              {[
                ['Precio acordado', `${soles(o.precioKg)} por kg`],
                ['Total estimado', soles(o.total)],
                ['WhatsApp', o.contraparte.whatsapp],
              ].map(([etiqueta, valor]) => (
                <div
                  key={etiqueta}
                  className="row sp"
                  style={{ padding: '9px 0', borderBottom: '1.5px solid var(--line)' }}
                >
                  <span className="mini">{etiqueta}</span>
                  <b style={{ textAlign: 'right' }}>{valor}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="panel stack" style={{ gap: 16 }}>
            <h2>¿Dónde se encuentran?</h2>
            <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label="Punto de encuentro">
              {o.puedeEncontrarseEnElLocal && (
                <label className="chk">
                  <input
                    type="radio"
                    name="tipo"
                    checked={tipo === 'LOCAL_DEL_CENTRO'}
                    onChange={() => setTipo('LOCAL_DEL_CENTRO')}
                  />
                  <span>
                    <b>En el local del centro</b>
                    <span className="mini" style={{ display: 'block' }}>
                      {o.contraparte.direccion}
                    </span>
                  </span>
                </label>
              )}
              <label className="chk">
                <input
                  type="radio"
                  name="tipo"
                  checked={tipo === 'REFERENCIA'}
                  onChange={() => setTipo('REFERENCIA')}
                />
                <span>
                  <b>En otro punto</b>
                  <span className="mini" style={{ display: 'block' }}>
                    Una referencia que ambos reconozcan; no hace falta tu dirección.
                  </span>
                </span>
              </label>
            </div>
            {tipo === 'REFERENCIA' && (
              <>
                <div className={clases('field', error && !referencia && 'err')}>
                  <label htmlFor="referencia">Referencia del punto de encuentro</label>
                  <div className="inp ta">
                    <textarea
                      id="referencia"
                      rows={2}
                      maxLength={160}
                      placeholder="Ej. Esquina de Jr. Moquegua con Av. Huancané, frente a la farmacia"
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                    />
                  </div>
                </div>
                {hayMapa ? (
                  <div className="field">
                    <span className="lbl">
                      Pin en el mapa <span className="opt">(opcional)</span>
                    </span>
                    <SelectorPin valor={pin} centro={null} alCambiar={setPin} />
                  </div>
                ) : (
                  <p className="mini">El mapa no está disponible: describe bien el lugar en la referencia.</p>
                )}
              </>
            )}
            <div className="grid2" style={{ gap: 16 }}>
              <div className="field">
                <span className="lbl">Día</span>
                <div className="seg" role="group" aria-label="Día">
                  {DIAS.map((d) => (
                    <button key={d.valor} type="button" aria-pressed={dia === d.valor} onClick={() => setDia(d.valor)}>
                      {d.texto}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="lbl">Franja</span>
                <div className="seg" role="group" aria-label="Franja">
                  {FRANJAS.map((f) => (
                    <button key={f} type="button" aria-pressed={franja === f} onClick={() => setFranja(f)}>
                      {TEXTO_FRANJA[f]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="mensaje">
                Mensaje <span className="opt">(opcional)</span>
              </label>
              <div className="inp ta">
                <textarea
                  id="mensaje"
                  rows={2}
                  maxLength={140}
                  placeholder="Ej. Llevo todo en costales, entro por la puerta lateral."
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <div className="note warn" role="alert">
                <Icono nombre="i-alert" />
                <span>{error}</span>
              </div>
            )}
            <button className="btn p" type="submit" disabled={enviando} style={{ alignSelf: 'flex-start' }}>
              {enviando ? 'Enviando…' : 'Enviar punto de encuentro'}
            </button>
          </div>
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>Lleva contigo</h3>
            <div className="list" style={{ gap: 10 }}>
              {LLEVA.map((texto) => (
                <label key={texto} className="chk">
                  <input type="checkbox" />
                  {texto}
                </label>
              ))}
            </div>
          </div>
          <div className="note warn">
            <Icono nombre="i-alert" />
            <span>Pesa frente a ti y acuerda el pago antes de entregar. En RecicloMap no se hacen pagos.</span>
          </div>
        </aside>
      </form>
    </>
  );
}

function Contenido({ id }: { id: string }) {
  const [o, setO] = useState<Operacion | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  if (error)
    return (
      <div className="note warn" role="alert">
        {error}
      </div>
    );
  if (!o) return <span className="girando" role="status" aria-label="Cargando" />;
  if (!o.acciones.includes('coordinar')) {
    return (
      <div className="note" role="status">
        <Icono nombre="i-info" />
        <span>
          El punto de encuentro ya no se puede cambiar. <Link href={`/operaciones/${o.id}`}>Ver el seguimiento</Link>
        </span>
      </div>
    );
  }
  return <Formulario o={o} />;
}

export function Coordinar({ id }: { id: string }) {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="his">
        <Contenido id={id} />
      </MarcoApp>
    </Protegida>
  );
}
