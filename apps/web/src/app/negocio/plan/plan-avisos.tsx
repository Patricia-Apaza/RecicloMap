'use client';

import {
  AVISO_MENSAJE_MAX,
  AVISO_TITULO_MAX,
  AVISO_VIGENCIA_DIAS_DEFECTO,
  esquemaAviso,
  formatearFecha,
  TEXTO_TIPO_AVISO,
  TIPOS_AVISO,
  type TipoAviso,
} from '@reciclomap/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { PlanDelNegocio } from './plan-negocio';

type MiAviso = {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string | null;
  vigenteHasta: string;
  creadoEn: string;
  vigente: boolean;
  oculto?: boolean;
  motivoOculto?: string | null;
};
type Respuesta = { limites: { maxActivos: number; vigenciaMaxDias: number; activos: number }; datos: MiAviso[] };
const COLOR: Record<TipoAviso, string> = {
  PROMOCION: 'var(--sand)',
  ANUNCIO: 'var(--sky)',
  NECESIDAD: 'var(--lime)',
  CAMPANA: 'var(--lilac)',
};

// Pantalla 46: los avisos son informativos y iguales para Gratis y Pro. El plan se muestra sin pedir ni cobrar nada todavía
function Contenido() {
  const aviso = useAviso();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [tipo, setTipo] = useState<TipoAviso>('ANUNCIO');
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [dias, setDias] = useState(AVISO_VIGENCIA_DIAS_DEFECTO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => setDatos(await pedir<Respuesta>('/mi-negocio/avisos')), []);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>('/mi-negocio/avisos')
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const publicar = async (evento: FormEvent) => {
    evento.preventDefault();
    const lectura = esquemaAviso.safeParse({ tipo, titulo, mensaje: mensaje || null, vigenciaDias: dias });
    if (!lectura.success) {
      const nuevos: Record<string, string> = {};
      for (const p of lectura.error.issues) nuevos[String(p.path[0])] ??= p.message;
      setErrores(nuevos);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      setDatos(await pedir<Respuesta>('/mi-negocio/avisos', { cuerpo: lectura.data }));
      setTitulo('');
      setMensaje('');
      aviso('Aviso publicado');
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.campos.length > 0) {
        setErrores(Object.fromEntries(causa.campos.map((c) => [c.campo, c.mensaje])));
      } else {
        setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos publicar el aviso.' });
      }
    } finally {
      setEnviando(false);
    }
  };

  const quitar = async (id: string) => {
    try {
      await pedir(`/mi-negocio/avisos/${id}`, { metodo: 'DELETE' });
      aviso('Aviso quitado');
      await cargar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos quitar el aviso.');
    }
  };

  const limites = datos?.limites;
  const lleno = limites ? limites.activos >= limites.maxActivos : false;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Plan y avisos"
        titulo="Hazte ver,"
        resaltado="sin trampa"
        descripcion="Tus avisos aparecen en tu ficha y llegan a quienes te guardaron en favoritos. El plan Pro da una ventaja limitada solo en el orden recomendado y la etiqueta «Destacado»; no cambia tu semáforo ni los órdenes que elige el reciclador."
      />
      <PlanDelNegocio />
      <div className="cols">
        <section className="panel">
          <h2>
            Tus avisos <small>sin ventanas emergentes</small>
          </h2>
          {limites && (
            <p className="mini" data-limites>
              {limites.activos} de {limites.maxActivos} avisos activos · duran hasta {limites.vigenciaMaxDias} días.
            </p>
          )}
          <div className="list">
            {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
            {datos?.datos.length === 0 && (
              <div className="empty">
                <p className="mini">Aún no tienes avisos.</p>
              </div>
            )}
            {datos?.datos.map((a) => (
              <div
                key={a.id}
                data-aviso={a.id}
                style={{
                  border: '2px solid var(--ink)',
                  borderRadius: 16,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  boxShadow: '3px 3px 0 var(--ink)',
                  opacity: a.vigente ? 1 : 0.6,
                }}
              >
                <div className="row sp">
                  <span
                    className="pill"
                    style={{ background: COLOR[a.tipo], color: 'var(--ink)', border: '1.5px solid var(--ink)' }}
                  >
                    {TEXTO_TIPO_AVISO[a.tipo]}
                  </span>
                  <span className="mini">
                    {a.oculto ? 'Oculto' : a.vigente ? `Hasta el ${formatearFecha(a.vigenteHasta)}` : 'Venció'}
                  </span>
                </div>
                <b style={{ font: '700 17px var(--head)', color: 'var(--ink)' }}>{a.titulo}</b>
                {a.mensaje && <span className="mini">{a.mensaje}</span>}
                {a.oculto && (
                  <span className="mini" data-aviso-oculto>
                    La administración ocultó este aviso. Motivo: {a.motivoOculto}. Puedes crear uno nuevo sin precios,
                    teléfonos ni enlaces.
                  </span>
                )}
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => void quitar(a.id)}
                  style={{ alignSelf: 'flex-start', padding: '0 6px' }}
                >
                  Quitar aviso
                </button>
              </div>
            ))}
          </div>
        </section>
        <aside className="panel">
          <h3>Publicar un aviso</h3>
          <form className="stack" style={{ gap: 14 }} onSubmit={(e) => void publicar(e)} noValidate>
            <div className="field">
              <span className="lbl">Tipo</span>
              <div
                className="seg"
                role="group"
                aria-label="Tipo de aviso"
                style={{ gridAutoFlow: 'row', gridTemplateColumns: '1fr 1fr' }}
              >
                {TIPOS_AVISO.map((t) => (
                  <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
                    {TEXTO_TIPO_AVISO[t]}
                  </button>
                ))}
              </div>
            </div>
            <Campo
              etiqueta="Título"
              maxLength={AVISO_TITULO_MAX}
              placeholder="Ej. Jornada de recepción este sábado"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              error={errores.titulo}
            />
            <div className={errores.mensaje ? 'field err' : 'field'}>
              <label htmlFor="mensaje-aviso">
                Mensaje <span className="opt">(opcional)</span>
              </label>
              <div className="inp ta">
                <textarea
                  id="mensaje-aviso"
                  maxLength={AVISO_MENSAJE_MAX}
                  placeholder="Ej. Atendemos de 8 a 12 y recibimos todo material limpio."
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />
              </div>
              {errores.mensaje && <span className="msg">{errores.mensaje}</span>}
            </div>
            <div className="field">
              <label htmlFor="dias-aviso">Dura</label>
              <div className="inp">
                <select id="dias-aviso" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                  {[1, 3, 7, 14]
                    .filter((d) => d <= (limites?.vigenciaMaxDias ?? 14))
                    .map((d) => (
                      <option key={d} value={d}>
                        {d} {d === 1 ? 'día' : 'días'}
                      </option>
                    ))}
                </select>
              </div>
              {errores.vigenciaDias && <span className="msg">{errores.vigenciaDias}</span>}
            </div>
            <div className="note">
              <Icono nombre="i-info" />
              <span>Los avisos informan: no pueden llevar precios, teléfonos ni enlaces.</span>
            </div>
            {errores.general && (
              <div className="note warn" role="alert">
                {errores.general}
              </div>
            )}
            <button className="btn p" type="submit" disabled={enviando || lleno}>
              {enviando ? 'Publicando…' : 'Publicar aviso'}
            </button>
            {lleno && <p className="mini">Ya tienes el máximo de avisos activos. Quita uno para publicar otro.</p>}
          </form>
        </aside>
      </div>
    </>
  );
}

export function PlanAvisos() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa="plan">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
