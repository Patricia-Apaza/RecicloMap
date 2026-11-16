'use client';

import { esquemaRutaDia, MAXIMO_PARADAS } from '@reciclomap/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Interruptor } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Parada = { zonaId: number; desde: string; hasta: string };
type Ruta = { fecha: string; publicada: boolean; paradas: Array<Parada & { zona: string }> };
type Zona = { id: number; nombre: string };

// Pantalla 56: la ruta es de hoy; al terminar el día en Lima se borra sola. Los recicladores ven zonas aproximadas, no tu posición
function Contenido() {
  const aviso = useAviso();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [publicar, setPublicar] = useState(true);
  const [fecha, setFecha] = useState('');
  const [errores, setErrores] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const [inicio, ruta] = await Promise.all([
        pedir<{ ciudadId: number }>('/comprador/inicio'),
        pedir<Ruta>('/mi-negocio/ruta'),
      ]);
      const lista = await pedir<{ datos: Zona[] }>(`/ciudades/${inicio.ciudadId}/zonas`);
      if (!vigente) return;
      setZonas(lista.datos);
      setParadas(ruta.paradas.map(({ zonaId, desde, hasta }) => ({ zonaId, desde, hasta })));
      setPublicar(ruta.paradas.length === 0 ? true : ruta.publicada);
      setFecha(ruta.fecha);
      setCargado(true);
    })().catch(() => vigente && setCargado(true));
    return () => {
      vigente = false;
    };
  }, []);

  const nombre = (zonaId: number) => zonas.find((z) => z.id === zonaId)?.nombre ?? 'Zona';
  const alternar = (zonaId: number) =>
    setParadas((lista) =>
      lista.some((p) => p.zonaId === zonaId)
        ? lista.filter((p) => p.zonaId !== zonaId)
        : lista.length >= MAXIMO_PARADAS
          ? lista
          : [...lista, { zonaId, desde: '08:00', hasta: '12:00' }],
    );
  const mover = (i: number, delta: number) =>
    setParadas((lista) => {
      const copia = [...lista];
      [copia[i], copia[i + delta]] = [copia[i + delta]!, copia[i]!];
      return copia;
    });
  const cambiar = (i: number, campo: 'desde' | 'hasta', valor: string) =>
    setParadas((lista) => lista.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));
  const invalida = (p: Parada) => p.hasta <= p.desde;

  const guardar = async () => {
    const lectura = esquemaRutaDia.safeParse({ publicar, paradas });
    if (!lectura.success) {
      setErrores(lectura.error.issues[0]?.message ?? 'Revisa tu ruta.');
      return;
    }
    if (publicar && paradas.length === 0) {
      setErrores('Agrega al menos una zona para publicar tu ruta.');
      return;
    }
    setErrores(null);
    setGuardando(true);
    try {
      await pedir('/mi-negocio/ruta', { metodo: 'PUT', cuerpo: lectura.data });
      aviso(
        publicar ? 'Tu ruta es visible para los recicladores' : 'Guardamos tu ruta; no se muestra a los recicladores',
      );
    } catch (causa) {
      setErrores(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tu ruta.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Comprador móvil"
        titulo="Tu ruta de"
        resaltado="hoy"
        descripcion="Elige las zonas que vas a recorrer y en qué horario. Los recicladores ven solo zonas aproximadas, no tu posición."
        acciones={<Interruptor etiqueta="Publicar mi ruta" marcado={publicar} alCambiar={setPublicar} />}
      />
      {!cargado && <span className="girando" aria-label="Cargando" />}
      {cargado && (
        <div className="cols">
          <section className="stack">
            <div className="panel">
              <h2>Zonas disponibles</h2>
              <div className="row wr g8" role="group" aria-label="Zonas disponibles">
                {zonas.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    className="cp"
                    aria-pressed={paradas.some((p) => p.zonaId === z.id)}
                    onClick={() => alternar(z.id)}
                  >
                    {z.nombre}
                  </button>
                ))}
              </div>
              <p className="mini" style={{ marginTop: 10 }}>
                Hasta {MAXIMO_PARADAS} zonas por día.
              </p>
            </div>
            <div className="panel">
              <h2>
                Orden del recorrido <small>usa las flechas para reordenar</small>
              </h2>
              <div className="list" style={{ gap: 10 }} data-paradas>
                {paradas.length === 0 && <p className="mini">Elige al menos una zona arriba.</p>}
                {paradas.map((p, i) => (
                  <div
                    key={p.zonaId}
                    className="row g16 wr"
                    data-parada={p.zonaId}
                    style={{
                      border: `2px solid ${invalida(p) ? '#A83226' : 'var(--ink)'}`,
                      borderRadius: 16,
                      padding: '12px 14px',
                      background: invalida(p) ? '#FFF7F4' : undefined,
                    }}
                  >
                    <b className="mono" style={{ width: 24 }}>
                      {i + 1}
                    </b>
                    <b style={{ flex: 1, minWidth: 150, font: '700 16px var(--head)' }}>{nombre(p.zonaId)}</b>
                    <div className="inp" style={{ height: 40, width: 130 }}>
                      <input
                        type="time"
                        aria-label={`${nombre(p.zonaId)} desde`}
                        value={p.desde}
                        onChange={(e) => cambiar(i, 'desde', e.target.value)}
                      />
                    </div>
                    <span>a</span>
                    <div className="inp" style={{ height: 40, width: 130 }}>
                      <input
                        type="time"
                        aria-label={`${nombre(p.zonaId)} hasta`}
                        value={p.hasta}
                        onChange={(e) => cambiar(i, 'hasta', e.target.value)}
                      />
                    </div>
                    <div className="row g8">
                      <button
                        type="button"
                        className="ib"
                        aria-label="Subir"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                        style={{ width: 34, height: 34 }}
                      >
                        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                          <Icono nombre="i-down" />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ib"
                        aria-label="Bajar"
                        disabled={i === paradas.length - 1}
                        onClick={() => mover(i, 1)}
                        style={{ width: 34, height: 34 }}
                      >
                        <Icono nombre="i-down" />
                      </button>
                      <button
                        type="button"
                        className="ib"
                        aria-label={`Quitar ${nombre(p.zonaId)}`}
                        onClick={() => alternar(p.zonaId)}
                        style={{ width: 34, height: 34 }}
                      >
                        <Icono nombre="i-close" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {errores && (
                <div className="note warn" role="alert" style={{ marginTop: 12 }}>
                  {errores}
                </div>
              )}
              <button
                type="button"
                className="btn p"
                style={{ marginTop: 14 }}
                disabled={guardando || paradas.some(invalida)}
                onClick={() => void guardar()}
              >
                {guardando ? 'Guardando…' : 'Guardar ruta de hoy'}
              </button>
            </div>
          </section>
          <aside className="stack">
            <div className="panel">
              <h3>Resumen</h3>
              <div className="list" style={{ gap: 8 }}>
                <div className="row sp">
                  <span>Zonas</span>
                  <b className="mono">{paradas.length}</b>
                </div>
                <div className="row sp">
                  <span>Primera parada</span>
                  <b className="mono">{paradas[0]?.desde ?? '—'}</b>
                </div>
                <div className="row sp">
                  <span>Última parada</span>
                  <b className="mono">{paradas.length ? paradas[paradas.length - 1]!.hasta : '—'}</b>
                </div>
                <div className="row sp">
                  <span>Visible para recicladores</span>
                  <b>{publicar && paradas.length > 0 ? 'Sí' : 'No'}</b>
                </div>
              </div>
            </div>
            <div className="note">
              <Icono nombre="i-info" />
              <span>
                La ruta es de hoy{fecha ? ` (${fecha})` : ''}: se borra sola al terminar el día. Cambiar tu estado a «En
                ruta» o «Fuera de servicio» se hace en el{' '}
                <Link href={RUTAS.compradorInicio} style={{ color: 'var(--deep)', fontWeight: 700 }}>
                  inicio
                </Link>
                .
              </span>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export function RutaDelDia() {
  return (
    <Protegida roles={['COMPRADOR_MOVIL']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
