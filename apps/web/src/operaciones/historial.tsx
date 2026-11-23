'use client';

import { CODIGOS_MATERIAL, type CodigoMaterial, formatearFecha, NOMBRE_MATERIAL } from '@reciclomap/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { FichaMaterial, kilos, soles } from '@/publicaciones/piezas';
import type { Historial } from '@/publicaciones/tipos';
import { pedir, pedirArchivo } from '@/sesion/api';
import { PildoraOperacion } from './piezas';

type Estado = keyof Historial['conteos'];
const PESTANAS: Array<[Estado, string]> = [
  ['todas', 'Todas'],
  ['en-curso', 'En curso'],
  ['completadas', 'Completadas'],
  ['canceladas', 'Canceladas'],
];

export async function descargarCsv(estado: string, material: string | null, nombre: string) {
  const consulta = new URLSearchParams({ estado, ...(material ? { material } : {}) });
  const archivo = await pedirArchivo(`/operaciones/exportar?${consulta.toString()}`);
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `${nombre}-${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

// Pantallas 28 (reciclador) y 51 (negocio): la misma tabla, con columnas según el rol
export function HistorialOperaciones({ negocio }: { negocio: boolean }) {
  const aviso = useAviso();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('todas');
  const [material, setMaterial] = useState<CodigoMaterial | null>(null);
  const [datos, setDatos] = useState<Historial | null>(null);

  useEffect(() => {
    let vigente = true;
    const consulta = new URLSearchParams({ estado, ...(material ? { material } : {}) });
    pedir<Historial>(`/operaciones?${consulta.toString()}`)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch(() => vigente && setDatos(null));
    return () => {
      vigente = false;
    };
  }, [estado, material]);

  const descargar = async () => {
    try {
      await descargarCsv(estado, material, negocio ? 'historial-compras' : 'historial-operaciones');
    } catch {
      aviso('No pudimos descargar el archivo.');
    }
  };

  const ind = datos?.indicadores;
  return (
    <>
      <EncabezadoPagina
        antetitulo={negocio ? 'Mi negocio' : 'Todo lo que has reciclado'}
        titulo={negocio ? 'Historial de' : 'Historial de'}
        resaltado={negocio ? 'compras' : 'operaciones'}
        descripcion={
          negocio
            ? 'Cada operación con recicladores: peso, precio acordado y estado.'
            : 'Cada entrega con su estado, su comprador y los puntos que sumaste. Solo las completadas dan puntos.'
        }
        acciones={
          <button type="button" className="btn" onClick={() => void descargar()}>
            <Icono nombre="i-down" />
            Descargar CSV
          </button>
        }
      />
      <div className="grid4" style={{ marginBottom: 24 }}>
        <Kpi
          etiqueta="Operaciones"
          valor={ind?.operaciones ?? '—'}
          detalle={`${ind?.enCurso ?? 0} en curso`}
          icono="i-truck"
          fondo="sky"
        />
        <Kpi
          etiqueta={negocio ? 'Kilos recibidos' : 'Kilos reciclados'}
          valor={ind ? kilos(ind.kg) : '—'}
          unidad="kg"
          detalle="solo completadas"
          icono="i-recycle"
          fondo="sand"
        />
        <Kpi
          etiqueta={negocio ? 'Monto pagado' : 'Monto recibido'}
          valor={ind ? soles(ind.monto) : '—'}
          detalle="pagado fuera de RecicloMap"
          icono="i-cash"
          fondo="mint"
        />
        {negocio ? (
          <Kpi
            etiqueta="Recicladores"
            valor={ind?.recicladores ?? '—'}
            detalle="con quienes completaste"
            icono="i-user"
            fondo="lilac"
          />
        ) : (
          <Kpi etiqueta="Puntos" valor={ind?.puntos ?? '—'} detalle="1 punto por kg" icono="i-trophy" fondo="lilac" />
        )}
      </div>
      <section className="panel">
        <div className="row wr g8" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
          <div className="seg" role="group" aria-label="Estado">
            {PESTANAS.map(([clave, texto]) => (
              <button key={clave} type="button" aria-pressed={estado === clave} onClick={() => setEstado(clave)}>
                {texto} {datos?.conteos[clave] ?? ''}
              </button>
            ))}
          </div>
          <div className="inp" style={{ maxWidth: 220 }}>
            <select
              aria-label="Material"
              value={material ?? ''}
              onChange={(e) => setMaterial((e.target.value || null) as CodigoMaterial | null)}
            >
              <option value="">Todos los materiales</option>
              {CODIGOS_MATERIAL.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {NOMBRE_MATERIAL[codigo]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <table className="tbl" tabIndex={0}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Material</th>
                <th>Peso</th>
                <th>{negocio ? 'Reciclador' : 'Comprador'}</th>
                <th>Precio por kg</th>
                <th>Total</th>
                <th>Estado</th>
                {!negocio && <th style={{ textAlign: 'right' }}>Puntos</th>}
              </tr>
            </thead>
            <tbody>
              {datos === null && (
                <tr>
                  <td colSpan={8}>
                    <span className="girando" role="status" aria-label="Cargando" />
                  </td>
                </tr>
              )}
              {datos?.datos.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty" style={{ border: 0 }}>
                      <b>Nada por aquí</b>
                      <span className="mini">
                        {negocio
                          ? 'Cuando un reciclador acepte tu oferta, la operación aparecerá aquí.'
                          : 'Cuando aceptes una oferta, la operación aparecerá aquí.'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {datos?.datos.map((o) => (
                <tr
                  key={o.id}
                  data-operacion={o.id}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/operaciones/${o.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && router.push(`/operaciones/${o.id}`)}
                >
                  <td className="mono">{formatearFecha(o.fecha)}</td>
                  <td>
                    <span className="row g8">
                      <FichaMaterial codigo={o.material.codigo} tamano={30} />
                      <b>{o.material.nombre}</b>
                    </span>
                  </td>
                  <td className="mono">
                    {kilos(o.kg)} kg{!o.kgConfirmados && <span className="mini"> (publicado)</span>}
                  </td>
                  <td>{o.contraparte}</td>
                  <td className="mono">{soles(o.precioKg)}</td>
                  <td className="mono">{o.estado === 'CANCELADA' ? '—' : soles(o.total)}</td>
                  <td>
                    <PildoraOperacion estado={o.estado} enDisputa={o.enDisputa} />
                  </td>
                  {!negocio && (
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {o.estado === 'COMPLETADA' ? `+${o.puntos ?? 0}` : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {datos && (
          <p className="mini" style={{ marginTop: 12 }}>
            Mostrando {datos.datos.length} de {datos.conteos.todas} operaciones. Toca una fila para ver su seguimiento.
          </p>
        )}
      </section>
    </>
  );
}
