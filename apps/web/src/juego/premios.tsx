'use client';

import { formatearFecha, TEXTO_ESTADO_PREMIO, TEXTO_FILTRO_PREMIOS, type FiltroPremios } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { textoVence } from './piezas';
import type { EstadoPremioVista, PremioGanadoVista, PremioReclamado, RespuestaPremios } from './tipos';
import { useDatos } from './usar-datos';

const FILTROS: FiltroPremios[] = ['todos', 'por-reclamar', 'reclamados', 'entregados', 'puntos'];
const TONO: Record<EstadoPremioVista, string> = {
  POR_RECLAMAR: 'warn',
  RECLAMADO: 'blue',
  ENTREGADO: 'open',
  VENCIDO: 'closed',
  RENUNCIADO: 'grey',
  ACREDITADO: 'open',
};

type Abierto = { premio: PremioGanadoVista; reclamado: PremioReclamado | null };

// Renunciar deja el premio sin entregarse, no devuelve stock y no se puede deshacer
function Renuncia({
  premio,
  alCerrar,
  alRenunciar,
}: {
  premio: PremioGanadoVista | null;
  alCerrar: () => void;
  alRenunciar: () => void;
}) {
  const aviso = useAviso();
  const [enviando, setEnviando] = useState(false);
  const renunciar = async () => {
    if (!premio) return;
    setEnviando(true);
    try {
      await pedir(`/yo/premios/${premio.id}/renunciar`, { cuerpo: { confirmar: true } });
      aviso('Renunciaste al premio.');
      alRenunciar();
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos registrar tu renuncia.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana
      abierta={premio !== null}
      alCerrar={alCerrar}
      antetitulo="RENUNCIAR AL PREMIO"
      titulo={premio?.nombre ?? ''}
    >
      <p>
        Si renuncias, no recibirás este premio y no se puede deshacer. El premio no vuelve a la ruleta: se registra como
        renunciado. Sirve, por ejemplo, para poder eliminar tu cuenta sin esperar a que venza el plazo.
      </p>
      <div className="row g8 wr">
        <button type="button" className="btn dn" disabled={enviando} onClick={() => void renunciar()}>
          Sí, renuncio a este premio
        </button>
        <button type="button" className="btn" onClick={alCerrar}>
          Me lo quedo
        </button>
      </div>
    </Ventana>
  );
}

function Reclamo({
  abierto,
  alCerrar,
  alReclamar,
}: {
  abierto: Abierto | null;
  alCerrar: () => void;
  alReclamar: (premio: PremioReclamado) => void;
}) {
  const aviso = useAviso();
  const [enviando, setEnviando] = useState(false);
  if (!abierto) return null;
  const { premio, reclamado } = abierto;
  const codigo = reclamado?.codigo ?? premio.codigo;
  const punto = reclamado?.puntoEntrega ?? premio.puntoEntrega;

  const reclamar = async () => {
    setEnviando(true);
    try {
      alReclamar(await pedir<PremioReclamado>(`/yo/premios/${premio.id}/reclamar`, { cuerpo: {} }));
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos reclamar el premio.');
      alCerrar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana abierta alCerrar={alCerrar} antetitulo="CÓMO RECLAMAR" titulo={premio.nombre}>
      {codigo ? (
        <div
          data-codigo-premio
          style={{
            border: '2px dashed var(--ink)',
            borderRadius: 16,
            padding: 18,
            textAlign: 'center',
            background: '#fff',
          }}
        >
          <div className="mini">Tu código</div>
          <div style={{ font: '700 34px var(--mono)', letterSpacing: '.08em' }}>{codigo}</div>
        </div>
      ) : (
        <p>Al reclamar te mostramos tu código. Después lo presentas en el punto de entrega.</p>
      )}
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>
          Ve al punto de entrega: <b>{punto ?? 'el que te indicamos'}</b>.
        </li>
        <li>Muestra este código en tu celular.</li>
        <li>El equipo de RecicloMap marca el premio como entregado cuando lo recibes.</li>
      </ol>
      <div className="row g8 wr">
        {!codigo && (
          <button type="button" className="btn p" disabled={enviando} onClick={() => void reclamar()}>
            Reclamar premio
          </button>
        )}
        <button type="button" className={codigo ? 'btn p' : 'btn'} onClick={alCerrar}>
          {codigo ? 'Entendido' : 'Cerrar'}
        </button>
      </div>
    </Ventana>
  );
}

function Contenido() {
  const aviso = useAviso();
  const [filtro, setFiltro] = useState<FiltroPremios>('todos');
  const [version, setVersion] = useState(0);
  const [renunciando, setRenunciando] = useState<PremioGanadoVista | null>(null);
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const { datos, fallo } = useDatos<RespuestaPremios>(`/yo/premios?filtro=${filtro}`, version);
  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar tus premios" />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const r = datos.resumen;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Gamificación"
        titulo="Tus"
        resaltado="premios"
        descripcion="Lo que ganaste en la ruleta. Los premios con objeto se recogen con un código y no se cambian por dinero."
        acciones={
          <Link className="btn p" href={RUTAS.ruleta}>
            <Icono nombre="i-gift" />
            Ir a la ruleta
          </Link>
        }
      />
      <div className="grid4" style={{ marginBottom: 24 }} data-kpis>
        <Kpi etiqueta="Ganados" icono="i-gift" valor={String(r.ganados)} detalle="en total" />
        <Kpi etiqueta="Por reclamar" icono="i-clock" valor={String(r.porReclamar)} detalle="dentro de su plazo" />
        <Kpi etiqueta="Entregados" icono="i-check" valor={String(r.entregados)} detalle="ya los tienes" />
        <Kpi etiqueta="Puntos ganados" icono="i-star" valor={String(r.puntosGanados)} detalle="por la ruleta" />
      </div>
      <section className="panel">
        <div className="seg" style={{ marginBottom: 16 }} role="group" aria-label="Filtrar premios">
          {FILTROS.map((f) => (
            <button key={f} type="button" aria-pressed={f === filtro} onClick={() => setFiltro(f)}>
              {TEXTO_FILTRO_PREMIOS[f]} {datos.conteos[f]}
            </button>
          ))}
        </div>
        {datos.items.length === 0 ? (
          <EstadoVacio
            icono="i-gift"
            titulo="Sin premios aquí"
            accion={
              <Link className="btn p sm" href={RUTAS.ruleta}>
                Probar suerte en la ruleta
              </Link>
            }
          />
        ) : (
          <div className="list">
            {datos.items.map((p) => (
              <div
                key={p.id}
                data-premio-ganado={p.estado}
                className="row g16 wr"
                style={{
                  border: '2px solid var(--ink)',
                  borderRadius: 18,
                  padding: '14px 16px',
                  boxShadow: '3px 3px 0 var(--ink)',
                }}
              >
                <span
                  className="mi"
                  style={{ width: 52, height: 52, background: p.tipo === 'PUNTOS' ? 'var(--lime)' : 'var(--sky)' }}
                >
                  <Icono nombre={p.tipo === 'PUNTOS' ? 'i-star' : 'i-gift'} />
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="row g8 wr">
                    <b style={{ font: '800 17px var(--head)' }}>{p.nombre}</b>
                    {p.patrocinado && <span className="pill blue">Aliado</span>}
                    <span className={`pill ${TONO[p.estado]}`}>
                      <i />
                      {TEXTO_ESTADO_PREMIO[p.estado]}
                    </span>
                  </div>
                  <div className="mini">
                    Ganado {formatearFecha(p.ganadoEn)}
                    {p.codigo ? ` · código ${p.codigo}` : ''}
                    {p.venceEn ? ` · ${textoVence(p.venceEn)}` : ''}
                  </div>
                </div>
                {p.estado === 'POR_RECLAMAR' && (
                  <button
                    type="button"
                    className="btn p sm"
                    data-reclamar={p.id}
                    onClick={() => setAbierto({ premio: p, reclamado: null })}
                  >
                    Cómo reclamar
                  </button>
                )}
                {p.estado === 'RECLAMADO' && (
                  <button type="button" className="btn sm" onClick={() => setAbierto({ premio: p, reclamado: null })}>
                    Ver código
                  </button>
                )}
                {(p.estado === 'POR_RECLAMAR' || p.estado === 'RECLAMADO') && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    data-renunciar={p.id}
                    onClick={() => setRenunciando(p)}
                  >
                    Renunciar a este premio
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <Renuncia
        premio={renunciando}
        alCerrar={() => setRenunciando(null)}
        alRenunciar={() => {
          setRenunciando(null);
          setVersion((v) => v + 1);
        }}
      />
      <Reclamo
        abierto={abierto}
        alCerrar={() => {
          setAbierto(null);
          setVersion((v) => v + 1);
        }}
        alReclamar={(reclamado) => {
          setAbierto((actual) => (actual ? { ...actual, reclamado } : actual));
          aviso('Premio reclamado. Presenta tu código en el punto de entrega.');
          setVersion((v) => v + 1);
        }}
      />
    </>
  );
}

export function MisPremios() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
