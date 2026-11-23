'use client';

import { formatearFecha, formatearHace, TEXTO_TIPO_PREMIO, TIPOS_PREMIO } from '@reciclomap/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Kpi, Nota } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { MarcoApp } from '@/navegacion/marco-app';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { VentanaMotivo } from '../comun';

type TipoPremio = (typeof TIPOS_PREMIO)[number];
type Premio = {
  id?: string;
  nombre: string;
  tipo: TipoPremio;
  puntos: number | null;
  probabilidad: number;
  stock: number | null;
  patrocinador: string | null;
  puntoEntrega: string | null;
  vigenciaCanjeDias: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  activo: boolean;
  veces?: number;
  stockBajo?: boolean;
};
type Catalogo = { enPausa: boolean; stockBajo: number; sumaActivos: number; valido: boolean; datos: Premio[] };
type Fila = {
  id: string;
  codigo: string;
  premio: string;
  persona: string;
  puntoEntrega: string | null;
  estado: string;
  reclamadoEn: string | null;
  venceEn: string;
  entregadoEn: string | null;
};
type Entregas = { conteos: Record<string, number>; datos: Fila[] };
type FiltroEntrega = 'por-entregar' | 'por-vencer' | 'entregados' | 'vencidos';

const FILTROS: Array<{ clave: FiltroEntrega; texto: string }> = [
  { clave: 'por-entregar', texto: 'Por entregar' },
  { clave: 'por-vencer', texto: 'Por vencer' },
  { clave: 'entregados', texto: 'Entregados' },
  { clave: 'vencidos', texto: 'Vencidos' },
];
const NUEVO: Premio = {
  nombre: '',
  tipo: 'PUNTOS',
  puntos: 10,
  probabilidad: 0,
  stock: null,
  patrocinador: null,
  puntoEntrega: null,
  vigenciaCanjeDias: null,
  vigenteDesde: null,
  vigenteHasta: null,
  activo: false,
};

const dia = (iso: string | null) => (iso ? new Date(`${iso}`).toISOString() : null);

function Contenido() {
  const notificar = useAviso();
  const [pestana, setPestana] = useState<'premios' | 'entregas'>('premios');
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [filas, setFilas] = useState<Premio[]>([]);
  const [version, setVersion] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [reponer, setReponer] = useState<Premio | null>(null);
  const [cantidad, setCantidad] = useState('10');
  const [pausa, setPausa] = useState<'pausar' | 'reanudar' | null>(null);
  const [nuevo, setNuevo] = useState<Premio | null>(null);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroEntrega>('por-entregar');
  const [entregas, setEntregas] = useState<Entregas | null>(null);
  const [entregar, setEntregar] = useState<{ codigo: string; premio?: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nota, setNota] = useState('');
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    pedir<Catalogo>('/admin/premios')
      .then((r) => {
        if (!vigente) return;
        setCatalogo(r);
        setFilas(r.datos);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [version]);

  useEffect(() => {
    let vigente = true;
    pedir<Entregas>(`/admin/premios-entregas?estado=${filtro}`)
      .then((r) => vigente && setEntregas(r))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [filtro, version]);

  const suma = useMemo(
    () => Math.round(filas.filter((p) => p.activo).reduce((s, p) => s + Math.round(p.probabilidad * 100), 0)) / 100,
    [filas],
  );
  const sinPremio = filas.filter((p) => p.activo && p.tipo === 'SIN_PREMIO').length;
  const valida = suma === 100 && sinPremio === 1;
  const cambiar = (indice: number, cambio: Partial<Premio>) =>
    setFilas((f) => f.map((p, i) => (i === indice ? { ...p, ...cambio } : p)));
  const refrescar = () => setVersion((v) => v + 1);

  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Premios y"
        resaltado="ruleta"
        descripcion="Los cambios rigen para los giros siguientes; lo que ya salió no se toca. Los premios son puntos de bono u objetos, nunca dinero."
      />
      {catalogo?.enPausa && (
        <Nota tono="atencion">
          La ruleta está en pausa: las personas conservan sus giros y pueden reclamar lo que ya ganaron.
        </Nota>
      )}
      <div className="grid3" style={{ margin: '16px 0 24px' }} data-kpis>
        <Kpi
          etiqueta="Por entregar"
          icono="i-gift"
          valor={entregas?.conteos['por-entregar'] ?? '—'}
          detalle="Reclamados"
        />
        <Kpi
          etiqueta="Por vencer"
          icono="i-alert"
          valor={entregas?.conteos['por-vencer'] ?? '—'}
          detalle="Sin reclamar"
        />
        <Kpi etiqueta="Entregados" icono="i-check" valor={entregas?.conteos['entregados'] ?? '—'} detalle="En total" />
      </div>
      <div className="row sp wr" style={{ marginBottom: 16, gap: 12 }}>
        <div className="seg" role="group" aria-label="Sección">
          <button type="button" aria-pressed={pestana === 'premios'} onClick={() => setPestana('premios')}>
            Premios
          </button>
          <button type="button" aria-pressed={pestana === 'entregas'} onClick={() => setPestana('entregas')}>
            Entregas
          </button>
        </div>
        {catalogo && (
          <button
            type="button"
            className={catalogo.enPausa ? 'btn p' : 'btn dn'}
            onClick={() => setPausa(catalogo.enPausa ? 'reanudar' : 'pausar')}
          >
            {catalogo.enPausa ? 'Reanudar ruleta' : 'Pausar ruleta'}
          </button>
        )}
      </div>

      {pestana === 'premios' && (
        <section className="panel" data-seccion="premios">
          {!catalogo && <span className="girando" role="status" aria-label="Cargando" />}
          <div className="list">
            {filas.map((p, i) => {
              const ganado = (p.veces ?? 0) > 0;
              return (
                <div
                  key={p.id ?? `nuevo-${i}`}
                  data-premio={p.nombre}
                  className="row g16 wr"
                  style={{
                    border: '2px solid var(--ink)',
                    borderRadius: 16,
                    padding: '12px 14px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Campo
                      etiqueta="Nombre"
                      value={p.nombre}
                      maxLength={60}
                      disabled={ganado}
                      ayuda={
                        ganado
                          ? `Ya salió ${p.veces} veces: no cambia de nombre ni se borra, solo se desactiva.`
                          : undefined
                      }
                      onChange={(e) => cambiar(i, { nombre: e.target.value })}
                    />
                    <div className="mini">
                      {TEXTO_TIPO_PREMIO[p.tipo]}
                      {p.tipo === 'PUNTOS' && p.puntos ? ` · ${p.puntos} puntos` : ''}
                      {p.tipo === 'OBJETO' && p.puntoEntrega ? ` · ${p.puntoEntrega}` : ''}
                      {p.stockBajo && (
                        <span className="pill closed" style={{ marginLeft: 6 }}>
                          Stock bajo
                        </span>
                      )}
                    </div>
                  </div>
                  <Campo
                    etiqueta="Probabilidad"
                    sufijo="%"
                    inputMode="decimal"
                    value={String(p.probabilidad)}
                    onChange={(e) => cambiar(i, { probabilidad: Number(e.target.value.replace(',', '.')) || 0 })}
                    style={{ width: 90 }}
                  />
                  {p.tipo === 'OBJETO' && (
                    <Campo
                      etiqueta="Plazo de reclamo"
                      sufijo="días"
                      inputMode="numeric"
                      value={String(p.vigenciaCanjeDias ?? '')}
                      onChange={(e) => cambiar(i, { vigenciaCanjeDias: Number(e.target.value) || null })}
                      style={{ width: 90 }}
                    />
                  )}
                  <div style={{ minWidth: 110 }}>
                    <div className="mini">Stock</div>
                    <b>{p.stock === null ? 'Sin límite' : p.stock}</b>
                    {p.id && p.stock !== null && (
                      <div>
                        <button type="button" className="btn sm" onClick={() => setReponer(p)}>
                          Reponer
                        </button>
                      </div>
                    )}
                  </div>
                  <label className="row g8">
                    <input
                      type="checkbox"
                      checked={p.activo}
                      onChange={(e) => cambiar(i, { activo: e.target.checked })}
                    />
                    <span>Activo</span>
                  </label>
                </div>
              );
            })}
          </div>
          {filas.length === 0 && catalogo && <EstadoVacio icono="i-gift" titulo="Sin premios" />}
          <div className="row sp wr" style={{ marginTop: 16, gap: 12 }}>
            <div data-suma className={valida ? '' : 'err'} aria-live="polite">
              <b>Suma de los activos: {suma} %</b>
              <div className="mini">
                {valida
                  ? 'Lista para guardar.'
                  : suma !== 100
                    ? 'Debe sumar exactamente 100 %.'
                    : 'Debe haber un solo «Sigue intentando» activo.'}
              </div>
            </div>
            <div className="row g8 wr">
              <button type="button" className="btn" onClick={() => setNuevo({ ...NUEVO })}>
                Agregar premio
              </button>
              <button
                type="button"
                className="btn p"
                disabled={!valida || guardando}
                onClick={() => setGuardando(true)}
              >
                Guardar catálogo
              </button>
            </div>
          </div>
        </section>
      )}

      {pestana === 'entregas' && (
        <section className="panel" data-seccion="entregas">
          <div className="row sp wr" style={{ marginBottom: 12, gap: 12 }}>
            <div className="seg" role="group" aria-label="Estado de la entrega">
              {FILTROS.map((f) => (
                <button
                  key={f.clave}
                  type="button"
                  aria-pressed={filtro === f.clave}
                  onClick={() => setFiltro(f.clave)}
                >
                  {f.texto} {entregas ? `(${entregas.conteos[f.clave] ?? 0})` : ''}
                </button>
              ))}
            </div>
            <div className="row g8">
              <Campo
                etiqueta="Código del premio"
                placeholder="RM-XXXX"
                value={codigo}
                maxLength={7}
                error={errorCodigo ?? undefined}
                onChange={(e) => {
                  setCodigo(e.target.value.toUpperCase());
                  setErrorCodigo(null);
                }}
              />
              <button
                type="button"
                className="btn p"
                onClick={() =>
                  /^RM-[A-Z0-9]{4}$/.test(codigo)
                    ? setEntregar({ codigo })
                    : setErrorCodigo('El código tiene la forma RM-XXXX.')
                }
              >
                Marcar entregado
              </button>
            </div>
          </div>
          {!entregas && <span className="girando" role="status" aria-label="Cargando" />}
          {entregas?.datos.length === 0 && <EstadoVacio icono="i-check" titulo="Nada por aquí" />}
          <div className="list">
            {entregas?.datos.map((f) => (
              <div
                key={f.id}
                data-codigo={f.codigo}
                className="row g16 wr"
                style={{ border: '2px solid var(--ink)', borderRadius: 16, padding: '12px 14px' }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b>{f.premio}</b> <span className="pill blue">{f.codigo}</span>
                  <div className="mini">
                    {f.persona}
                    {f.puntoEntrega ? ` · ${f.puntoEntrega}` : ''}
                  </div>
                  <div className="mini">
                    {f.estado === 'ENTREGADO' && f.entregadoEn
                      ? `Entregado ${formatearHace(f.entregadoEn)}`
                      : f.estado === 'RECLAMADO' && f.reclamadoEn
                        ? `Reclamado ${formatearHace(f.reclamadoEn)} · vence ${formatearFecha(f.venceEn)}`
                        : `Vence ${formatearFecha(f.venceEn)}`}
                  </div>
                </div>
                {f.estado === 'RECLAMADO' && (
                  <button
                    type="button"
                    className="btn sm p"
                    onClick={() => setEntregar({ codigo: f.codigo, premio: f.premio })}
                  >
                    Marcar entregado
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {guardando && (
        <VentanaMotivo
          antetitulo="GUARDAR CATÁLOGO"
          titulo="Cambios en premios y probabilidades"
          texto="Rige desde el próximo giro. Los giros ya hechos no cambian."
          textoBoton="Guardar"
          alCerrar={() => setGuardando(false)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/premios', {
              metodo: 'PUT',
              cuerpo: {
                motivo,
                premios: filas.map((p) => ({
                  ...(p.id ? { id: p.id } : {}),
                  nombre: p.nombre.trim(),
                  tipo: p.tipo,
                  puntos: p.puntos,
                  probabilidad: p.probabilidad,
                  stock: p.stock,
                  patrocinador: p.patrocinador,
                  puntoEntrega: p.puntoEntrega,
                  vigenciaCanjeDias: p.vigenciaCanjeDias,
                  vigenteDesde: dia(p.vigenteDesde),
                  vigenteHasta: dia(p.vigenteHasta),
                  activo: p.activo,
                })),
              },
            });
            notificar('Catálogo guardado');
            setGuardando(false);
            refrescar();
          }}
        />
      )}
      {reponer?.id && (
        <VentanaMotivo
          antetitulo="REPONER STOCK"
          titulo={reponer.nombre}
          texto={`Hoy hay ${reponer.stock} en stock.`}
          textoBoton="Reponer"
          alCerrar={() => setReponer(null)}
          alConfirmar={async (motivo) => {
            await pedir(`/admin/premios/${reponer.id}/reponer`, { cuerpo: { cantidad: Number(cantidad), motivo } });
            notificar('Stock repuesto');
            setReponer(null);
            refrescar();
          }}
        >
          <Campo
            etiqueta="Cantidad a sumar"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </VentanaMotivo>
      )}
      {pausa && (
        <VentanaMotivo
          antetitulo={pausa === 'pausar' ? 'PAUSAR RULETA' : 'REANUDAR RULETA'}
          titulo={pausa === 'pausar' ? 'La ruleta dejará de girar' : 'La ruleta vuelve a girar'}
          texto={
            pausa === 'pausar'
              ? 'Verán «Ruleta en pausa», conservan sus giros y pueden reclamar lo que ya ganaron.'
              : 'Todos podrán volver a usar sus giros.'
          }
          textoBoton={pausa === 'pausar' ? 'Pausar' : 'Reanudar'}
          peligro={pausa === 'pausar'}
          alCerrar={() => setPausa(null)}
          alConfirmar={async (motivo) => {
            await pedir(`/admin/ruleta/${pausa === 'pausar' ? 'pausar' : 'reanudar'}`, {
              cuerpo: { motivo, confirmar: true },
            });
            notificar(pausa === 'pausar' ? 'Ruleta en pausa' : 'Ruleta en marcha');
            setPausa(null);
            refrescar();
          }}
        />
      )}
      {nuevo && (
        <VentanaMotivo
          antetitulo="NUEVO PREMIO"
          titulo="Agregar premio"
          texto="Se agrega desactivado y con 0 %. Actívalo y reparte la probabilidad antes de guardar."
          textoBoton="Agregar a la lista"
          alCerrar={() => setNuevo(null)}
          alConfirmar={() => {
            if (nuevo.nombre.trim().length < 3) {
              setErrorNuevo('Escribe un nombre de al menos 3 letras.');
              return Promise.resolve();
            }
            setFilas((f) => [...f, { ...nuevo, nombre: nuevo.nombre.trim() }]);
            setNuevo(null);
            return Promise.resolve();
          }}
        >
          <Campo
            etiqueta="Nombre"
            maxLength={60}
            value={nuevo.nombre}
            error={errorNuevo ?? undefined}
            onChange={(e) => {
              setNuevo({ ...nuevo, nombre: e.target.value });
              setErrorNuevo(null);
            }}
          />
          <div className="field">
            <label htmlFor="tipo-premio">Tipo</label>
            <select
              id="tipo-premio"
              value={nuevo.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoPremio;
                setNuevo({
                  ...nuevo,
                  tipo,
                  puntos: tipo === 'PUNTOS' ? 10 : null,
                  stock: tipo === 'SIN_PREMIO' ? null : 10,
                  puntoEntrega: tipo === 'OBJETO' ? 'Oficina de RecicloMap' : null,
                  vigenciaCanjeDias: tipo === 'OBJETO' ? 30 : null,
                });
              }}
            >
              {TIPOS_PREMIO.map((t) => (
                <option key={t} value={t}>
                  {TEXTO_TIPO_PREMIO[t]}
                </option>
              ))}
            </select>
          </div>
          {nuevo.tipo === 'PUNTOS' && (
            <Campo
              etiqueta="Puntos de bono"
              inputMode="numeric"
              value={String(nuevo.puntos ?? '')}
              onChange={(e) => setNuevo({ ...nuevo, puntos: Number(e.target.value) || null })}
            />
          )}
          {nuevo.tipo === 'OBJETO' && (
            <Campo
              etiqueta="Punto de entrega"
              value={nuevo.puntoEntrega ?? ''}
              onChange={(e) => setNuevo({ ...nuevo, puntoEntrega: e.target.value })}
            />
          )}
        </VentanaMotivo>
      )}
      {entregar && (
        <VentanaMotivo
          antetitulo="ENTREGAR PREMIO"
          titulo={`${entregar.codigo}${entregar.premio ? ` · ${entregar.premio}` : ''}`}
          texto="Solo se entrega un premio que la persona ya reclamó. Ella recibirá un aviso."
          textoBoton="Marcar entregado"
          alCerrar={() => setEntregar(null)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/premios-entregas', {
              cuerpo: { codigo: entregar.codigo, nota: [nota, motivo].filter(Boolean).join(' · ').slice(0, 150) },
            });
            notificar('Premio entregado');
            setEntregar(null);
            setCodigo('');
            setNota('');
            refrescar();
          }}
        >
          <Campo etiqueta="Nota" opcional maxLength={100} value={nota} onChange={(e) => setNota(e.target.value)} />
        </VentanaMotivo>
      )}
    </>
  );
}

export function PremiosAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="rul">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
