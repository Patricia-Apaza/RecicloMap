'use client';

import { esquemaZona } from '@reciclomap/shared';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { MarcoApp } from '@/navegacion/marco-app';
import { pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { VentanaMotivo } from '../comun';

type Zona = { id: number; nombre: string; lat: number; lng: number };
type Ciudad = {
  id: number;
  nombre: string;
  region: string;
  estado: 'ACTIVA' | 'PROXIMAMENTE';
  usuarios: number;
  centrosVerificados: number;
  movilesVerificados: number;
  listaEspera: number;
  avisadas: number;
  requisitos: { zonas: boolean; verificadoresAsignados: boolean; preciosBaseCargados: boolean };
  informativo: { centrosVerificados: number; centrosSugeridos: number };
  puedeActivar: boolean;
  zonas: Zona[];
};
type Accion =
  | { tipo: 'nueva' }
  | { tipo: 'activar' | 'desactivar'; ciudad: Ciudad }
  | { tipo: 'requisito'; ciudad: Ciudad; campo: 'verificadoresAsignados' | 'preciosBaseCargados'; valor: boolean }
  | { tipo: 'zona'; ciudad: Ciudad }
  | { tipo: 'quitarZona'; ciudad: Ciudad; zona: Zona };

const REQUISITOS: Array<{ clave: 'zonas' | 'verificadoresAsignados' | 'preciosBaseCargados'; texto: string }> = [
  { clave: 'zonas', texto: 'Al menos una zona definida' },
  { clave: 'verificadoresAsignados', texto: 'Verificadores asignados' },
  { clave: 'preciosBaseCargados', texto: 'Precios base cargados' },
];

function Contenido() {
  const notificar = useAviso();
  const [ciudades, setCiudades] = useState<Ciudad[] | null>(null);
  const [version, setVersion] = useState(0);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [nombre, setNombre] = useState('');
  const [region, setRegion] = useState('');
  const [zona, setZona] = useState({ nombre: '', lat: '', lng: '' });
  const [errorZona, setErrorZona] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    pedir<{ datos: Ciudad[] }>('/admin/ciudades')
      .then((r) => vigente && setCiudades(r.datos))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [version]);

  const terminar = (mensaje: string) => {
    notificar(mensaje);
    setAccion(null);
    setNombre('');
    setRegion('');
    setZona({ nombre: '', lat: '', lng: '' });
    setVersion((v) => v + 1);
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Ciudades y"
        resaltado="zonas"
        descripcion="Una ciudad se abre solo cuando cumple sus requisitos. Quienes esperaban reciben un solo aviso."
      />
      <div className="row" style={{ marginBottom: 16 }}>
        <button type="button" className="btn p" onClick={() => setAccion({ tipo: 'nueva' })}>
          Agregar ciudad
        </button>
      </div>
      {!ciudades && <span className="girando" role="status" aria-label="Cargando" />}
      {ciudades?.length === 0 && <EstadoVacio icono="i-map" titulo="Aún no hay ciudades" />}
      <div className="stack" style={{ gap: 16 }}>
        {ciudades?.map((c) => (
          <section key={c.id} className="panel" data-ciudad={c.nombre} data-estado={c.estado}>
            <div className="row sp wr" style={{ gap: 8 }}>
              <div>
                <b style={{ font: '800 20px var(--head)' }}>{c.nombre}</b>
                <span className={`pill ${c.estado === 'ACTIVA' ? 'open' : 'grey'}`} style={{ marginLeft: 8 }}>
                  {c.estado === 'ACTIVA' ? 'Activa' : 'Próximamente'}
                </span>
                <div className="mini">
                  {c.region} · {c.usuarios} usuarios · {c.centrosVerificados} centros y {c.movilesVerificados}{' '}
                  compradores móviles verificados
                </div>
              </div>
              <div className="mini">
                Lista de espera: <b data-espera>{c.listaEspera}</b>
                {c.avisadas > 0 && ` (${c.avisadas} avisadas)`}
              </div>
            </div>
            {c.estado === 'PROXIMAMENTE' && (
              <div style={{ marginTop: 12 }}>
                <b>Requisitos para abrir</b>
                <ul className="list" style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
                  {REQUISITOS.map((r) => {
                    const cumple = c.requisitos[r.clave];
                    const editable = r.clave !== 'zonas';
                    return (
                      <li key={r.clave} className="row g8 wr">
                        <span aria-hidden="true">{cumple ? '✅' : '⬜'}</span>
                        <span>{r.texto}</span>
                        <span className="mini">{cumple ? 'Cumplido' : 'Pendiente'}</span>
                        {editable && (
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() =>
                              setAccion({
                                tipo: 'requisito',
                                ciudad: c,
                                campo: r.clave as 'verificadoresAsignados' | 'preciosBaseCargados',
                                valor: !cumple,
                              })
                            }
                          >
                            {cumple ? 'Quitar' : 'Marcar cumplido'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mini">
                  Sugerido: {c.informativo.centrosSugeridos} centros verificados (hoy {c.informativo.centrosVerificados}
                  ). Es informativo: una ciudad cerrada no recibe registros de negocios.
                </p>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div className="row sp wr">
                <b>Zonas ({c.zonas.length})</b>
                <button type="button" className="btn sm" onClick={() => setAccion({ tipo: 'zona', ciudad: c })}>
                  Agregar zona
                </button>
              </div>
              <div className="row g8 wr" style={{ marginTop: 8 }}>
                {c.zonas.map((z) => (
                  <span key={z.id} className="pill blue">
                    {z.nombre}
                    <button
                      type="button"
                      aria-label={`Quitar la zona ${z.nombre}`}
                      className="btn sm"
                      style={{ marginLeft: 6 }}
                      onClick={() => setAccion({ tipo: 'quitarZona', ciudad: c, zona: z })}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="row g8 wr" style={{ marginTop: 12 }}>
              {c.estado === 'PROXIMAMENTE' ? (
                <button
                  type="button"
                  className="btn p"
                  disabled={!c.puedeActivar}
                  onClick={() => setAccion({ tipo: 'activar', ciudad: c })}
                >
                  Activar ciudad
                </button>
              ) : (
                <button type="button" className="btn dn" onClick={() => setAccion({ tipo: 'desactivar', ciudad: c })}>
                  Volver a «Próximamente»
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      {accion?.tipo === 'nueva' && (
        <VentanaMotivo
          antetitulo="NUEVA CIUDAD"
          titulo="Agregar ciudad"
          texto="Se crea como «Próximamente»."
          textoBoton="Agregar"
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir('/admin/ciudades', { cuerpo: { nombre, region, motivo } });
            terminar('Ciudad agregada');
          }}
        >
          <Campo etiqueta="Nombre" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Campo etiqueta="Región" maxLength={60} value={region} onChange={(e) => setRegion(e.target.value)} />
        </VentanaMotivo>
      )}
      {accion?.tipo === 'requisito' && (
        <VentanaMotivo
          antetitulo="REQUISITO"
          titulo={`${accion.ciudad.nombre}: ${accion.campo === 'verificadoresAsignados' ? 'verificadores asignados' : 'precios base cargados'}`}
          texto={accion.valor ? 'Confirma que ya está cumplido.' : 'Se marcará como pendiente.'}
          textoBoton="Guardar"
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir(`/admin/ciudades/${accion.ciudad.id}/requisitos`, {
              metodo: 'PUT',
              cuerpo: { [accion.campo]: accion.valor, motivo },
            });
            terminar('Requisito actualizado');
          }}
        />
      )}
      {(accion?.tipo === 'activar' || accion?.tipo === 'desactivar') && (
        <VentanaMotivo
          antetitulo={accion.tipo === 'activar' ? 'ACTIVAR CIUDAD' : 'CERRAR CIUDAD'}
          titulo={accion.ciudad.nombre}
          texto={
            accion.tipo === 'activar'
              ? `Se abre el registro en ${accion.ciudad.nombre} y se avisa una sola vez a ${accion.ciudad.listaEspera} personas en espera.`
              : 'Solo se puede cerrar si nadie la usa todavía.'
          }
          textoBoton={accion.tipo === 'activar' ? 'Activar' : 'Cerrar ciudad'}
          peligro={accion.tipo === 'desactivar'}
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir(`/admin/ciudades/${accion.ciudad.id}/${accion.tipo}`, { cuerpo: { motivo, confirmar: true } });
            terminar(accion.tipo === 'activar' ? 'Ciudad activada' : 'Ciudad cerrada');
          }}
        />
      )}
      {accion?.tipo === 'zona' && (
        <VentanaMotivo
          antetitulo="NUEVA ZONA"
          titulo={`Agregar zona en ${accion.ciudad.nombre}`}
          texto="Un punto central de referencia (latitud y longitud)."
          textoBoton="Agregar"
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            const lectura = esquemaZona.safeParse({ nombre: zona.nombre, lat: zona.lat, lng: zona.lng, motivo });
            if (!lectura.success) {
              setErrorZona(lectura.error.issues[0]?.message ?? 'Revisa los datos de la zona.');
              throw new Error('zona');
            }
            await pedir(`/admin/ciudades/${accion.ciudad.id}/zonas`, { cuerpo: lectura.data });
            terminar('Zona agregada');
          }}
        >
          <Campo
            etiqueta="Nombre de la zona"
            maxLength={80}
            value={zona.nombre}
            onChange={(e) => setZona({ ...zona, nombre: e.target.value })}
          />
          <Campo
            etiqueta="Latitud"
            inputMode="decimal"
            value={zona.lat}
            onChange={(e) => setZona({ ...zona, lat: e.target.value })}
          />
          <Campo
            etiqueta="Longitud"
            inputMode="decimal"
            value={zona.lng}
            onChange={(e) => setZona({ ...zona, lng: e.target.value })}
            error={errorZona ?? undefined}
          />
        </VentanaMotivo>
      )}
      {accion?.tipo === 'quitarZona' && (
        <VentanaMotivo
          antetitulo="QUITAR ZONA"
          titulo={`${accion.zona.nombre} · ${accion.ciudad.nombre}`}
          texto="No se puede quitar una zona que ya usan personas o negocios."
          textoBoton="Quitar zona"
          peligro
          alCerrar={() => setAccion(null)}
          alConfirmar={async (motivo) => {
            await pedir(`/admin/zonas/${accion.zona.id}/eliminar`, { cuerpo: { motivo, confirmar: true } });
            terminar('Zona quitada');
          }}
        />
      )}
    </>
  );
}

export function CiudadesAdmin() {
  return (
    <Protegida roles={['ADMIN']}>
      <MarcoApp activa="ciu">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
