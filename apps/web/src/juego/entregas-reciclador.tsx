'use client';

import {
  CODIGOS_MATERIAL,
  type CodigoMaterial,
  esquemaEntregaDirecta,
  formatearFecha,
  NOMBRE_MATERIAL,
  TEXTO_ENTREGA_DIRECTA,
} from '@reciclomap/shared';
import { type FormEvent, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Nota } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { FONDO_MATERIAL } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { kg, textoVence } from './piezas';
import type { RespuestaMisEntregas } from './tipos';
import { useDatos } from './usar-datos';

const TONO = {
  PENDIENTE: 'pill warn',
  CONFIRMADO: 'pill open',
  RECHAZADO: 'pill closed',
  VENCIDO: 'pill grey',
} as const;

const diaDeLima = (desplazamiento: number) =>
  new Date(Date.now() - desplazamiento * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

// Registro de entrega directa (RN-15): sin publicación previa; el negocio confirma los kilos que recibió
function Contenido() {
  const aviso = useAviso();
  const [version, setVersion] = useState(0);
  const { datos } = useDatos<RespuestaMisEntregas>('/registros-directos/mios', version);
  const negocios = useDatos<{ datos: Array<{ id: string; nombre: string; tipo: string; zona: string | null }> }>(
    '/registros-directos/negocios',
  );
  const [compradorId, setCompradorId] = useState('');
  const [material, setMaterial] = useState<CodigoMaterial | ''>('');
  const [kilos, setKilos] = useState('');
  const [fecha, setFecha] = useState(diaDeLima(0));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const registrar = async (evento: FormEvent) => {
    evento.preventDefault();
    const lectura = esquemaEntregaDirecta.safeParse({ compradorId, material, kg: kilos, fecha });
    if (!lectura.success) {
      const nuevos: Record<string, string> = {};
      for (const p of lectura.error.issues) nuevos[String(p.path[0])] ??= p.message;
      setErrores(nuevos);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      await pedir('/registros-directos', { cuerpo: lectura.data });
      aviso('Registrada. El negocio debe confirmar los kilos que recibió.');
      setKilos('');
      setMaterial('');
      setVersion((v) => v + 1);
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.campos.length > 0) {
        setErrores(Object.fromEntries(causa.campos.map((c) => [c.campo, c.mensaje])));
      } else {
        setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos registrar la entrega.' });
      }
    } finally {
      setEnviando(false);
    }
  };

  const limites = datos?.limites;
  const lleno = limites ? limites.pendientes >= limites.maxPendientes : false;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Puntos y niveles"
        titulo="Entrega"
        resaltado="directa"
        descripcion="¿Entregaste material a un negocio sin publicarlo antes? Regístralo y que el negocio confirme los kilos que recibió."
      />
      <div className="cols">
        <section className="stack">
          <div className="panel" data-panel="mis-entregas">
            <h2>
              Mis entregas <small>últimas 30</small>
            </h2>
            {datos === null && <span className="girando" aria-label="Cargando" />}
            {datos?.datos.length === 0 && (
              <EstadoVacio
                icono="i-recycle"
                titulo="Aún no registraste entregas"
                descripcion="Usa el formulario para registrar la primera."
              />
            )}
            <div className="list" style={{ gap: 12 }}>
              {datos?.datos.map((e) => (
                <div
                  key={e.id}
                  data-entrega={e.id}
                  data-estado={e.estado}
                  className="row g16 wr"
                  style={{ border: '2px solid var(--ink)', borderRadius: 16, padding: '12px 14px' }}
                >
                  <span className="mi" style={{ width: 44, height: 44, background: FONDO_MATERIAL[e.material.codigo] }}>
                    <Icono nombre={ICONO_MATERIAL[e.material.codigo]} />
                  </span>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <b style={{ font: '700 16px var(--head)' }}>
                      {e.material.nombre} · {kg(e.kgConfirmado ?? e.kg)} kg
                    </b>
                    <div className="mini">
                      {e.negocio} · {formatearFecha(e.fecha)}
                    </div>
                    {e.estado === 'CONFIRMADO' && e.kgConfirmado !== null && e.kgConfirmado !== e.kg && (
                      <div className="mini">
                        Registraste {kg(e.kg)} kg; el negocio confirmó {kg(e.kgConfirmado)} kg.
                      </div>
                    )}
                    {e.estado === 'PENDIENTE' && (
                      <div className="mini">{textoVence(e.venceEn)} · sin puntos hasta confirmarse</div>
                    )}
                    {e.estado === 'RECHAZADO' && e.motivoRechazo && (
                      <div className="mini">Motivo: {e.motivoRechazo}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={TONO[e.estado]}>
                      <i />
                      {TEXTO_ENTREGA_DIRECTA[e.estado]}
                    </span>
                    {e.estado === 'CONFIRMADO' && (
                      <div className="mono" style={{ marginTop: 6 }}>
                        +{e.puntosOtorgados} pts
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>Registrar entrega</h3>
            <form className="stack" style={{ gap: 14 }} onSubmit={(e) => void registrar(e)} noValidate>
              <div className={errores.compradorId ? 'field err' : 'field'}>
                <label htmlFor="negocio-entrega">¿A qué negocio?</label>
                <div className="inp">
                  <select id="negocio-entrega" value={compradorId} onChange={(e) => setCompradorId(e.target.value)}>
                    <option value="">Elige un negocio</option>
                    {negocios.datos?.datos.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nombre}
                        {n.zona ? ` · ${n.zona}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {errores.compradorId && <span className="msg">{errores.compradorId}</span>}
              </div>
              <div className="field">
                <span className="lbl">¿Qué material?</span>
                <div
                  className="seg"
                  role="group"
                  aria-label="Material"
                  style={{ gridAutoFlow: 'row', gridTemplateColumns: '1fr 1fr' }}
                >
                  {CODIGOS_MATERIAL.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="cp"
                      aria-pressed={material === m}
                      onClick={() => setMaterial(m)}
                    >
                      {NOMBRE_MATERIAL[m]}
                    </button>
                  ))}
                </div>
                {errores.material && <span className="msg">{errores.material}</span>}
              </div>
              <Campo
                etiqueta="Kilos entregados"
                sufijo="kg"
                inputMode="decimal"
                placeholder="Ej. 12"
                value={kilos}
                onChange={(e) => setKilos(e.target.value)}
                error={errores.kg}
              />
              <Campo
                etiqueta="¿Cuándo?"
                type="date"
                min={diaDeLima(7)}
                max={diaDeLima(0)}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                error={errores.fecha}
              />
              <Nota>
                No suma puntos hasta que el negocio confirme. Si no responde, vence a los {limites?.vigenciaDias ?? 7}{' '}
                días.
                {limites ? ` Tope de ${limites.topeDiario} puntos por día por entregas directas.` : ''}
              </Nota>
              {errores.general && (
                <div className="note warn" role="alert">
                  {errores.general}
                </div>
              )}
              <button className="btn p" type="submit" disabled={enviando || lleno}>
                {enviando ? 'Registrando…' : 'Registrar entrega'}
              </button>
              {limites && (
                <p className="mini" data-limites>
                  {limites.pendientes} de {limites.maxPendientes} por confirmar · hoy sumaste {limites.puntosHoy} de{' '}
                  {limites.topeDiario} puntos.
                </p>
              )}
              {lleno && (
                <p className="mini">
                  Ya tienes el máximo de entregas por confirmar. Espera a que los negocios respondan.
                </p>
              )}
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}

export function EntregasReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
