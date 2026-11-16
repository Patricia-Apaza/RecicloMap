'use client';

import { type CodigoMaterial, formatearFechaHora, formatearHace } from '@reciclomap/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { FONDO_MATERIAL, soles } from '@/publicaciones/piezas';
import { DialogoDecision, PLAZOS_PRECIOS } from '@/reportes/piezas';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Accion = 'MARCAR' | 'PEDIR_CORRECCION' | 'SUSPENDER' | 'RESTITUIR';
type Precio = {
  id: string;
  negocio: { id: string; nombre: string; tipo: string };
  material: { codigo: CodigoMaterial; nombre: string };
  min: string;
  max: string;
  actualizadoEn: string;
  alertas: string[];
  moderacion: {
    estado: 'SOSPECHOSO' | 'CORRECCION_PEDIDA' | 'SUSPENDIDO';
    motivo: string;
    plazoHasta: string | null;
    plazoVencido: boolean;
  } | null;
  acciones: Accion[];
};
type Respuesta = {
  datos: Precio[];
  registro: Array<{
    accion: string;
    motivo: string | null;
    detalle: { negocio?: string; material?: string; estado?: string } | null;
    creadaEn: string;
  }>;
};

const ESTADO: Record<string, [string, string]> = {
  SOSPECHOSO: ['warn', 'Sospechoso'],
  CORRECCION_PEDIDA: ['blue', 'Corrección pedida'],
  SUSPENDIDO: ['closed', 'Suspendido'],
};
const ACCION: Record<Accion, { boton: string; titulo: string; explicacion: string; peligro: boolean }> = {
  MARCAR: {
    boton: 'Marcar',
    titulo: 'Marcar como sospechoso',
    explicacion: 'Queda marcado para seguimiento. El precio sigue visible.',
    peligro: false,
  },
  PEDIR_CORRECCION: {
    boton: 'Pedir corrección',
    titulo: 'Pedir corrección',
    explicacion: 'El negocio recibe un aviso con el motivo y el plazo. Si vence, te avisamos; nunca se suspende solo.',
    peligro: false,
  },
  SUSPENDER: {
    boton: 'Suspender',
    titulo: 'Suspender visibilidad',
    explicacion:
      'Deja de aparecer en el mapa, la lista, la ficha, la calculadora, comparar y favoritos. El negocio ve el motivo.',
    peligro: true,
  },
  RESTITUIR: {
    boton: 'Restituir',
    titulo: 'Restituir',
    explicacion: 'Se cierra la moderación y el precio vuelve a mostrarse.',
    peligro: false,
  },
};
const TEXTO_REGISTRO: Record<string, string> = {
  precio_marcar: 'Se marcó',
  precio_pedir_correccion: 'Se pidió corrección a',
  precio_suspender: 'Se suspendió la visibilidad de',
  precio_restituir: 'Se restituyó',
};

// Pantalla 61: marca, pide corrección o suspende con motivo; nunca edita el valor (RN-04, RN-05)
function Contenido() {
  const aviso = useAviso();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [elegido, setElegido] = useState<{ precio: Precio; accion: Accion } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>('/admin/precios')
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos({ datos: [], registro: [] }));
    return () => {
      vigente = false;
    };
  }, [version]);

  const confirmar = useCallback(
    async (cuerpo: { motivo: string; plazoHoras?: number }) => {
      if (!elegido) return;
      const ruta = {
        MARCAR: 'marcar',
        PEDIR_CORRECCION: 'pedir-correccion',
        SUSPENDER: 'suspender',
        RESTITUIR: 'restituir',
      }[elegido.accion];
      await pedir(`/admin/precios/${elegido.precio.id}/${ruta}`, { cuerpo });
      aviso('Acción registrada. El precio no se modificó.');
      setElegido(null);
      setVersion((v) => v + 1);
    },
    [elegido, aviso],
  );

  const conRiesgo = datos?.datos.filter((p) => p.moderacion || p.alertas.length > 0) ?? [];
  const resto = datos?.datos.filter((p) => !p.moderacion && p.alertas.length === 0) ?? [];
  const fila = (p: Precio) => (
    <tr key={p.id} data-precio={p.id}>
      <td>
        <b>{p.negocio.nombre}</b>
      </td>
      <td>
        <span className="row g8">
          <span
            className="mi"
            style={{ width: 28, height: 28, borderRadius: 8, background: FONDO_MATERIAL[p.material.codigo] }}
          >
            <Icono nombre={ICONO_MATERIAL[p.material.codigo]} tamano="sm" />
          </span>
          {p.material.nombre}
        </span>
      </td>
      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
        {soles(p.min)}–{Number(p.max).toFixed(2)}
        <div className="mini">{formatearHace(p.actualizadoEn)}</div>
      </td>
      <td style={{ maxWidth: 220 }}>
        {p.alertas.length ? (
          p.alertas.map((a) => (
            <span
              key={a}
              className="tag low"
              style={{ height: 'auto', padding: '4px 8px', whiteSpace: 'normal', marginBottom: 3 }}
            >
              <Icono nombre="i-alert" tamano="sm" />
              {a}
            </span>
          ))
        ) : (
          <span className="mini">Sin alertas</span>
        )}
      </td>
      <td>
        {p.moderacion ? (
          <span className={`pill ${ESTADO[p.moderacion.estado]![0]}`} title={p.moderacion.motivo}>
            {ESTADO[p.moderacion.estado]![1]}
            {p.moderacion.plazoHasta &&
              ` · ${p.moderacion.plazoVencido ? 'plazo vencido' : `hasta ${formatearFechaHora(p.moderacion.plazoHasta)}`}`}
          </span>
        ) : (
          <span className="pill grey">Sin marcar</span>
        )}
      </td>
      <td>
        <div className="row g8" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          {(['MARCAR', 'PEDIR_CORRECCION', 'SUSPENDER', 'RESTITUIR'] as Accion[]).map((accion) => (
            <button
              key={accion}
              type="button"
              className={accion === 'SUSPENDER' ? 'btn sm dn' : 'btn sm'}
              disabled={!p.acciones.includes(accion)}
              onClick={() => setElegido({ precio: p, accion })}
            >
              {ACCION[accion].boton}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <EncabezadoPagina
        antetitulo="Moderación de precios"
        titulo="Marca, pide corrección,"
        resaltado="no edites"
        descripcion="El dueño es quien cambia su precio. Tú puedes marcarlo, pedir corrección con plazo o suspender su visibilidad con un motivo."
        acciones={
          <Link className="btn" href={`${RUTAS.adminReportes}?tipo=NEGOCIO`}>
            Reportes de usuarios
          </Link>
        }
      />
      <div className="note" style={{ marginBottom: 20 }}>
        <Icono nombre="i-lock" />
        <span>
          <b>Sin botón de editar, a propósito.</b> Cada acción queda registrada con fecha y motivo.
        </span>
      </div>
      <div className="stack" style={{ gap: 24 }}>
        <section className="panel">
          <h2>
            Precios para revisar <small>ordenados por riesgo</small>
          </h2>
          <div style={{ overflowX: 'auto', position: 'relative' }}>
            <table className="tbl" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Comprador</th>
                  <th>Material</th>
                  <th>Rango</th>
                  <th>Alertas</th>
                  <th>Estado</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos === null && (
                  <tr>
                    <td colSpan={6}>
                      <span className="girando" aria-label="Cargando" />
                    </td>
                  </tr>
                )}
                {conRiesgo.map(fila)}
                {conRiesgo.length === 0 && datos && (
                  <tr>
                    <td colSpan={6} className="mini">
                      Ningún precio con alertas ni moderación vigente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {resto.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="mini" style={{ cursor: 'pointer' }}>
                Ver los otros {resto.length} precios sin alertas
              </summary>
              <div style={{ overflowX: 'auto', position: 'relative' }}>
                <table className="tbl" style={{ minWidth: 860 }}>
                  <tbody>{resto.map(fila)}</tbody>
                </table>
              </div>
            </details>
          )}
        </section>
        <div className="panel">
          <h3>Registro de acciones</h3>
          <div className="list" style={{ gap: 8, fontSize: 13.5 }}>
            {datos?.registro.length === 0 && <p className="mini">Aún no hay acciones registradas.</p>}
            {datos?.registro.map((r) => (
              <div
                key={`${r.creadaEn}-${r.accion}`}
                style={{ padding: '8px 0', borderBottom: '1.5px solid var(--line)' }}
              >
                <span className="mini mono">{formatearFechaHora(r.creadaEn)}</span>
                <br />
                {TEXTO_REGISTRO[r.accion] ?? r.accion} «{r.detalle?.negocio} · {r.detalle?.material}». Motivo:{' '}
                {r.motivo}.
              </div>
            ))}
          </div>
        </div>
      </div>
      <DialogoDecision
        abierta={elegido !== null}
        antetitulo={elegido ? `— ${ACCION[elegido.accion].titulo.toUpperCase()}` : ''}
        titulo={
          elegido
            ? `${elegido.precio.negocio.nombre} · ${elegido.precio.material.nombre} (${soles(elegido.precio.min)}–${Number(elegido.precio.max).toFixed(2)})`
            : ''
        }
        explicacion={elegido ? ACCION[elegido.accion].explicacion : undefined}
        boton={elegido ? ACCION[elegido.accion].titulo : 'Confirmar'}
        peligro={elegido ? ACCION[elegido.accion].peligro : false}
        plazos={elegido?.accion === 'PEDIR_CORRECCION' ? PLAZOS_PRECIOS : undefined}
        alCerrar={() => setElegido(null)}
        alConfirmar={confirmar}
      />
    </>
  );
}

export function ModeracionPrecios() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="pri">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
