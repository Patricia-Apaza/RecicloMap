'use client';

import { type CodigoMaterial, CODIGOS_MATERIAL, NOMBRE_MATERIAL, RADIOS_KM, type RadioKm } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { EtiquetaDemanda, EtiquetaSemaforo, EtiquetaDestacadoPro } from '@/diseno/etiquetas';
import { Icono } from '@/diseno/icono';
import { PedirUbicacion } from '@/mapa/pedir-ubicacion';
import { iconoNegocio, SelectorMaterial } from '@/mapa/piezas';
import { type Opcion, RUTA_DETALLE } from '@/mapa/resultados';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { kilos, soles } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';

type Calculo = {
  material: { codigo: CodigoMaterial; nombre: string };
  kg: number;
  radioKm: number;
  comparadoEntre: number;
  estimado: { min: string; max: string; negocio: string; distanciaKm: number; tipo: 'CENTRO' | 'MOVIL' } | null;
  puntos: number;
  opciones: Array<Opcion & { valor: { min: string; max: string } }>;
};
const RAPIDOS = [5, 10, 25, 50, 100];

const leerKg = (texto: string) => {
  const valor = Number(texto.replace(',', '.'));
  return Number.isFinite(valor) && valor > 0 && valor <= 5000 ? valor : null;
};

// Pantalla 18 (HU-07): el mismo conjunto y semáforo que el mapa, ordenado por lo que pagarían
function Contenido() {
  const parametros = useSearchParams();
  const inicial = parametros.get('material');
  const { ubicacion } = useUbicacion();
  const cabeceras = useMemo(() => cabecerasDeUbicacion(ubicacion), [ubicacion]);
  const [material, setMaterial] = useState<CodigoMaterial>(
    CODIGOS_MATERIAL.includes(inicial as CodigoMaterial) ? (inicial as CodigoMaterial) : 'pet',
  );
  const [texto, setTexto] = useState(parametros.get('kg') ?? '10');
  const [radio, setRadio] = useState<RadioKm>(5);
  const [estado, setEstado] = useState<{ calculo: Calculo | null; error: string | null; clave: string }>({
    calculo: null,
    error: null,
    clave: '',
  });
  const kg = leerKg(texto);
  const clave = kg && ubicacion ? `${material}|${kg}|${radio}|${JSON.stringify(cabeceras)}` : '';

  useEffect(() => {
    if (!clave || !kg) return;
    let vigente = true;
    const temporizador = setTimeout(() => {
      pedir<Calculo>(`/calculadora?material=${material}&kg=${kg}&radio=${radio}`, { cabeceras })
        .then((calculo) => vigente && setEstado({ calculo, error: null, clave }))
        .catch(
          (causa: unknown) =>
            vigente &&
            setEstado({
              calculo: null,
              error: causa instanceof ErrorApi ? causa.message : 'No pudimos calcular.',
              clave,
            }),
        );
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [clave, material, kg, radio, cabeceras]);

  const calculo = estado.clave === clave ? estado.calculo : null;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Calculadora de valor"
        titulo="¿Cuánto vale"
        resaltado="lo que tienes?"
        descripcion="Elige el material y los kilos. Te mostramos cuánto te pagarían cerca de ti y dónde conviene ir."
      />
      <div className="cols l">
        <section className="panel stack" style={{ gap: 18 }}>
          <div>
            <div className="lbl" style={{ marginBottom: 10 }}>
              1. Material
            </div>
            <SelectorMaterial material={material} alCambiar={setMaterial} />
          </div>
          <div className={kg ? 'field' : 'field err'}>
            <label htmlFor="kg">2. Kilos que tienes</label>
            <div className="inp">
              <input
                id="kg"
                inputMode="decimal"
                value={texto}
                placeholder="Ej. 10"
                onChange={(e) => setTexto(e.target.value)}
              />
              <span className="u">kg</span>
            </div>
            <div className="row wr g8" style={{ marginTop: 4 }}>
              {RAPIDOS.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className="cp"
                  aria-pressed={kg === valor}
                  onClick={() => setTexto(String(valor))}
                >
                  {valor} kg
                </button>
              ))}
            </div>
            {!kg && <span className="msg">Escribe un número mayor a 0 y menor o igual a 5 000.</span>}
          </div>
          <div className="field">
            <span className="lbl">3. Dentro de</span>
            <div
              className="seg"
              role="group"
              aria-label="Dentro de"
              style={{ width: '100%', gridAutoFlow: 'column', gridAutoColumns: '1fr' }}
            >
              {RADIOS_KM.map((km) => (
                <button key={km} type="button" aria-pressed={km === radio} onClick={() => setRadio(km)}>
                  {km} km
                </button>
              ))}
            </div>
          </div>
          <div className="note">
            <Icono nombre="i-info" />
            <span>
              Es un cálculo con los rangos de precio que publican los compradores. El pago final lo acuerdas con ellos;
              RecicloMap no procesa pagos.
            </span>
          </div>
        </section>
        <section className="stack" data-resultado>
          {!ubicacion && <PedirUbicacion />}
          {ubicacion && !kg && (
            <EstadoVacio
              icono="i-calc"
              titulo="Escribe los kilos"
              descripcion="Con el peso te mostramos cuánto vale."
            />
          )}
          {ubicacion && kg && !calculo && !estado.error && (
            <span className="girando" role="status" aria-label="Calculando" />
          )}
          {estado.error && estado.clave === clave && (
            <div className="note warn" role="alert">
              {estado.error}
            </div>
          )}
          {calculo && !calculo.estimado && (
            <EstadoVacio
              icono="i-search"
              titulo={`Nadie compra ${NOMBRE_MATERIAL[material]} a ${radio} km`}
              descripcion="Prueba con un radio más grande."
            />
          )}
          {calculo?.estimado && (
            <>
              <div className="panel dark" data-estimado>
                <div className="kick" style={{ color: 'var(--lime)' }}>
                  Valor estimado · {kilos(calculo.kg)} kg de {calculo.material.nombre}
                </div>
                <div
                  style={{
                    font: '800 clamp(36px, 5vw, 60px)/1 var(--head)',
                    letterSpacing: '-.04em',
                    margin: '12px 0 6px',
                  }}
                >
                  {soles(calculo.estimado.min)} <span style={{ color: 'var(--lime)' }}>–</span>{' '}
                  {soles(calculo.estimado.max).replace('S/ ', '').replace('S/', '')}
                </div>
                <p style={{ color: '#cfe4d8', margin: 0 }}>
                  si lo llevas a <b style={{ color: '#fff' }}>{calculo.estimado.negocio}</b> (
                  {calculo.estimado.distanciaKm.toFixed(1)} km), la mejor opción dentro de {calculo.radioKm} km.
                </p>
                <div className="row wr g8" style={{ marginTop: 14 }}>
                  <span className="pill" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}>
                    <Icono nombre="i-star" tamano="sm" /> +{calculo.puntos} puntos al completar
                  </span>
                  {calculo.estimado.tipo === 'MOVIL' && (
                    <span className="pill" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}>
                      Te lo recogen en tu zona
                    </span>
                  )}
                </div>
              </div>
              <div className="panel">
                <h2>
                  Dónde conviene{' '}
                  <small>
                    {calculo.opciones.length} mejores de {calculo.comparadoEntre} · ordenadas por valor
                  </small>
                </h2>
                <div className="list">
                  {calculo.opciones.map((opcion, indice) => (
                    <Link
                      key={opcion.id}
                      href={`${RUTA_DETALLE(opcion.id)}`}
                      className="row"
                      data-opcion={opcion.id}
                      style={{
                        textDecoration: 'none',
                        color: 'inherit',
                        border: '2px solid var(--ink)',
                        borderRadius: 16,
                        padding: '12px 14px',
                        gap: 14,
                        boxShadow: indice === 0 ? '4px 4px 0 var(--g)' : '3px 3px 0 var(--ink)',
                        background: indice === 0 ? '#F3FAE6' : '#fff',
                      }}
                    >
                      <span className={opcion.tipo === 'CENTRO' ? 'ico' : 'ico s'} aria-hidden="true">
                        <Icono nombre={iconoNegocio(opcion)} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row g8 wr">
                          <b style={{ font: '700 16px var(--head)', color: 'var(--ink)' }}>{opcion.nombre}</b>
                          {opcion.esPro && <EtiquetaDestacadoPro />}
                        </div>
                        <div className="mini row wr g8" style={{ gap: '4px 12px', marginTop: 3 }}>
                          <span>
                            <Icono nombre="i-pin" tamano="sm" /> {opcion.distanciaKm.toFixed(1)} km
                          </span>
                          <span>
                            {soles(opcion.precio.min)}–{Number(opcion.precio.max).toFixed(2)} por kg
                          </span>
                          <EtiquetaDemanda demanda={opcion.demanda} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono" style={{ font: '600 17px var(--mono)', color: 'var(--ink)' }}>
                          {soles(opcion.valor.min)}–{Number(opcion.valor.max).toFixed(2)}
                        </div>
                        <div style={{ marginTop: 5 }}>
                          <EtiquetaSemaforo semaforo={opcion.semaforo.clave} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <p className="mini" style={{ marginTop: 12 }}>
                  El semáforo compara entre los {calculo.comparadoEntre} que compran {calculo.material.nombre} dentro de{' '}
                  {calculo.radioKm} km, igual que en el mapa.
                </p>
              </div>
              <Link
                className="btn p"
                href={`${RUTAS.publicar}?m=${material}&kg=${calculo.kg}`}
                style={{ alignSelf: 'flex-start' }}
              >
                <Icono nombre="i-plus" />
                Publicar estos {kilos(calculo.kg)} kg y recibir ofertas
              </Link>
            </>
          )}
        </section>
      </div>
    </>
  );
}

export function Calculadora() {
  return (
    <Protegida invitado roles={['RECICLADOR']} pasos={['LISTO']}>
      <MarcoApp activa="calc">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
