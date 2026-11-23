'use client';

import { formatearFechaHora, TEXTO_TIPO_AUDITORIA, TIPOS_AUDITORIA } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { MarcoApp } from '@/navegacion/marco-app';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Fila = {
  id: string;
  cuando: string;
  tipo: keyof typeof TEXTO_TIPO_AUDITORIA;
  administrador: { id: string; nombre: string };
  accion: string;
  entidad: string;
  entidadId: string;
  motivo: string | null;
  antes: unknown;
  despues: unknown;
};
type Respuesta = {
  resumen: { total: number; ultimos7Dias: number; tipos: Record<string, number> };
  administradores: Array<{ id: string; nombre: string }>;
  total: number;
  pagina: number;
  porPagina: number;
  datos: Fila[];
};

const TEXTO_ACCION: Record<string, string> = {
  SUSPENDER: 'Suspendió una cuenta',
  REACTIVAR: 'Reactivó una cuenta',
  OCULTAR: 'Ocultó un aviso',
  RESTITUIR: 'Restituyó un aviso',
  ACTIVAR_PRO: 'Activó el plan Pro',
  APROBAR_SOLICITUD_PRO: 'Aprobó una solicitud del plan Pro',
  RECHAZAR_SOLICITUD_PRO: 'Rechazó una solicitud del plan Pro',
  DESACTIVAR_PRO: 'Desactivó el plan Pro',
  APROBAR: 'Aprobó una verificación',
  RECHAZAR: 'Rechazó una verificación',
};
const resumen = (valor: unknown): string => {
  if (!valor || typeof valor !== 'object') return '';
  return Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
};

// Pantalla 64: solo lectura. No hay botón de exportar en esta fase ni forma de editar o borrar una entrada
function Contenido() {
  const [tipo, setTipo] = useState('');
  const [admin, setAdmin] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    const consulta = new URLSearchParams({ pagina: String(pagina) });
    if (tipo) consulta.set('tipo', tipo);
    if (admin) consulta.set('admin', admin);
    if (q.trim()) consulta.set('q', q.trim());
    if (desde) consulta.set('desde', desde);
    if (hasta) consulta.set('hasta', hasta);
    pedir<Respuesta>(`/admin/auditoria?${consulta.toString()}`)
      .then((r) => vigente && (setDatos(r), setError(false)))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [tipo, admin, q, desde, hasta, pagina]);

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Registro de"
        resaltado="auditoría"
        descripcion="Todo lo que hacen los administradores, con fecha y motivo. Solo se puede leer: nadie puede borrar ni editar una entrada."
      />
      <div className="grid3" style={{ marginBottom: 24 }} data-kpis>
        <Kpi etiqueta="Entradas" icono="i-shield" valor={datos?.resumen.total ?? '—'} detalle="Desde el inicio" />
        <Kpi
          etiqueta="Últimos 7 días"
          icono="i-clock"
          valor={datos?.resumen.ultimos7Dias ?? '—'}
          detalle="Acciones recientes"
        />
        <Kpi
          etiqueta="Administradores"
          icono="i-user"
          valor={datos?.administradores.length ?? '—'}
          detalle="Con cuenta de administración"
        />
      </div>
      <section className="panel">
        <div className="row sp wr" style={{ marginBottom: 16, gap: 12 }}>
          <div className="seg" role="group" aria-label="Tipo">
            <button
              type="button"
              aria-pressed={tipo === ''}
              onClick={() => {
                setTipo('');
                setPagina(1);
              }}
            >
              Todo
            </button>
            {TIPOS_AUDITORIA.filter((t) => (datos?.resumen.tipos[t] ?? 0) > 0).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tipo === t}
                onClick={() => {
                  setTipo(t);
                  setPagina(1);
                }}
              >
                {TEXTO_TIPO_AUDITORIA[t]}
              </button>
            ))}
          </div>
          <div className="row g8 wr">
            <div className="inp" style={{ height: 42 }}>
              <select
                aria-label="Administrador"
                value={admin}
                onChange={(e) => {
                  setAdmin(e.target.value);
                  setPagina(1);
                }}
              >
                <option value="">Todos los administradores</option>
                {(datos?.administradores ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="inp" style={{ height: 42 }}>
              <input
                type="date"
                aria-label="Desde"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPagina(1);
                }}
              />
            </div>
            <div className="inp" style={{ height: 42 }}>
              <input
                type="date"
                aria-label="Hasta"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPagina(1);
                }}
              />
            </div>
            <div className="inp" style={{ height: 42 }}>
              <input
                aria-label="Buscar en el registro"
                placeholder="Buscar en el registro"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPagina(1);
                }}
              />
            </div>
          </div>
        </div>
        {error && (
          <p className="msg" role="alert">
            No pudimos cargar el registro.
          </p>
        )}
        {!datos && !error && <span className="girando" role="status" aria-label="Cargando" />}
        {datos && datos.datos.length === 0 && <EstadoVacio icono="i-search" titulo="Sin entradas con esos filtros" />}
        {datos && datos.datos.length > 0 && (
          <div style={{ overflow: 'auto' }}>
            <table className="tbl" tabIndex={0} data-tabla-auditoria>
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Tipo</th>
                  <th>Administrador</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((f) => (
                  <tr key={f.id} data-entrada={f.accion}>
                    <td className="mini">{formatearFechaHora(f.cuando)}</td>
                    <td>
                      <span className="pill grey">{TEXTO_TIPO_AUDITORIA[f.tipo] ?? f.tipo}</span>
                    </td>
                    <td>{f.administrador.nombre}</td>
                    <td>
                      <b>{TEXTO_ACCION[f.accion] ?? f.accion}</b>
                      {f.motivo && <div className="mini">Motivo: {f.motivo}</div>}
                      {resumen(f.despues) && <div className="mini">{resumen(f.despues)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {datos && (
          <div className="row sp wr" style={{ marginTop: 12 }}>
            <p className="mini" style={{ margin: 0 }}>
              {datos.total} {datos.total === 1 ? 'entrada' : 'entradas'} · página {pagina} de {paginas}
            </p>
            <div className="row g8">
              <button type="button" className="btn sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export function AuditoriaAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="dash">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
