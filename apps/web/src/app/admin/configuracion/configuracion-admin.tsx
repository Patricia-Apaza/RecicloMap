'use client';

import { formatearHace, type ReglaParametro } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, Nota } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { VentanaMotivo } from '../comun';
import { ControlesPlataforma } from './controles-plataforma';

type Parametro = ReglaParametro & {
  valor: number | null;
  ultimoCambio: { fecha: string; administrador: string; motivo: string } | null;
};
type Cambio = {
  clave: string;
  etiqueta: string;
  unidad: string;
  anterior: string;
  nuevo: string;
  motivo: string;
  fecha: string;
  administrador: string;
};
type Respuesta = {
  grupos: Array<{ clave: string; titulo: string; parametros: Parametro[] }>;
  fijos: Array<{ clave: string; etiqueta: string; motivo: string; valor: string | null }>;
  reglasFijas: Array<{ titulo: string; detalle: string }>;
  recientes: Cambio[];
};

function Contenido() {
  const notificar = useAviso();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [version, setVersion] = useState(0);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cambio, setCambio] = useState<{ parametro: Parametro; valor: number } | null>(null);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>('/admin/parametros')
      .then((r) => vigente && setDatos(r))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [version]);

  const preparar = (p: Parametro) => {
    const texto = borrador[p.clave] ?? String(p.valor ?? '');
    const valor = Number(texto);
    if (texto.trim() === '' || !Number.isInteger(valor)) {
      setErrores((e) => ({ ...e, [p.clave]: 'Escribe un número entero.' }));
      return;
    }
    if (valor < p.minimo || valor > p.maximo) {
      setErrores((e) => ({ ...e, [p.clave]: `Debe estar entre ${p.minimo} y ${p.maximo} ${p.unidad}.` }));
      return;
    }
    if (valor === p.valor) {
      setErrores((e) => ({ ...e, [p.clave]: 'Ya tiene ese valor.' }));
      return;
    }
    setErrores((e) => ({ ...e, [p.clave]: '' }));
    setCambio({ parametro: p, valor });
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Configuración"
        resaltado="general"
        descripcion="Cada cambio pide un motivo, queda en la auditoría y rige desde ese momento, nunca hacia atrás."
      />
      <Nota>
        Los semáforos, los niveles, el rango de precio y los tipos de premio son reglas del producto y no se editan.
      </Nota>
      <div className="stack" style={{ marginTop: 16, gap: 16 }}>
        <ControlesPlataforma />
        {!datos && <span className="girando" role="status" aria-label="Cargando" />}
        {datos?.grupos.map((g) => (
          <section key={g.clave} className="panel" data-grupo={g.clave}>
            <h2 style={{ font: '800 20px var(--head)', margin: '0 0 12px' }}>{g.titulo}</h2>
            <div className="list">
              {g.parametros.map((p) => (
                <div
                  key={p.clave}
                  data-parametro={p.clave}
                  className="row g16 wr"
                  style={{
                    border: '2px solid var(--ink)',
                    borderRadius: 16,
                    padding: '12px 14px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <b>{p.etiqueta}</b>
                    {p.costoPremios && (
                      <span className="pill blue" style={{ marginLeft: 8 }}>
                        Afecta el costo de premios
                      </span>
                    )}
                    <div className="mini">{p.ayuda}</div>
                    <div className="mini">
                      Rango {p.minimo}–{p.maximo} {p.unidad}
                      {p.ultimoCambio
                        ? ` · último cambio ${formatearHace(p.ultimoCambio.fecha)} por ${p.ultimoCambio.administrador}: ${p.ultimoCambio.motivo}`
                        : ''}
                    </div>
                    {errores[p.clave] && (
                      <div className="mini" role="alert" style={{ color: 'var(--red, #b3261e)' }}>
                        {errores[p.clave]}
                      </div>
                    )}
                  </div>
                  <div className="row g8">
                    <div className="inp" style={{ height: 42, width: 110 }}>
                      <input
                        aria-label={p.etiqueta}
                        inputMode="numeric"
                        value={borrador[p.clave] ?? String(p.valor ?? '')}
                        onChange={(e) => setBorrador((b) => ({ ...b, [p.clave]: e.target.value }))}
                      />
                      <span className="u">{p.unidad}</span>
                    </div>
                    <button type="button" className="btn sm" onClick={() => preparar(p)}>
                      Cambiar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {datos && (
          <section className="panel flat">
            <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Reglas fijas del producto</h2>
            <ul className="list" style={{ margin: 0, paddingLeft: 18 }}>
              {datos.fijos.map((f) => (
                <li key={f.clave}>
                  <b>{f.etiqueta}:</b> {f.valor ?? '—'} <span className="mini">{f.motivo}</span>
                </li>
              ))}
              {datos.reglasFijas.map((r) => (
                <li key={r.titulo}>
                  <b>{r.titulo}.</b> <span className="mini">{r.detalle}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {datos && (
          <section className="panel" data-historial>
            <h2 style={{ font: '800 20px var(--head)', margin: '0 0 8px' }}>Últimos cambios</h2>
            {datos.recientes.length === 0 && <p className="mini">Aún no hay cambios.</p>}
            <div className="list">
              {datos.recientes.map((c, i) => (
                <div key={`${c.clave}-${c.fecha}-${i}`} className="mini">
                  <b>{c.etiqueta}</b>: {c.anterior} → {c.nuevo} {c.unidad} · {c.administrador} ·{' '}
                  {formatearHace(c.fecha)}. Motivo: {c.motivo}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {cambio && (
        <VentanaMotivo
          antetitulo="CAMBIAR PARÁMETRO"
          titulo={`${cambio.parametro.etiqueta}: ${cambio.parametro.valor} → ${cambio.valor} ${cambio.parametro.unidad}`}
          texto="Rige desde ahora. No cambia lo que ya ocurrió."
          textoBoton="Confirmar cambio"
          confirmacionExtra={
            cambio.parametro.costoPremios
              ? 'Entiendo que esto cambia cuántos premios se reparten y su costo.'
              : undefined
          }
          alCerrar={() => setCambio(null)}
          alConfirmar={async (motivo, confirmarCosto) => {
            await pedir(`/admin/parametros/${cambio.parametro.clave}`, {
              metodo: 'PUT',
              cuerpo: { valor: cambio.valor, motivo, ...(cambio.parametro.costoPremios ? { confirmarCosto } : {}) },
            });
            notificar('Parámetro actualizado');
            setBorrador((b) => {
              const { [cambio.parametro.clave]: _quitado, ...resto } = b;
              return resto;
            });
            setCambio(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}

export function ConfiguracionAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="dash">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
