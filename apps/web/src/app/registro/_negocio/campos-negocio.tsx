'use client';

import { CODIGOS_MATERIAL, type CodigoMaterial, MAXIMO_FOTOS_NEGOCIO, NOMBRE_MATERIAL } from '@reciclomap/shared';
import { useEffect, useId, useMemo, useState } from 'react';
import { quitarFoto, subirFoto, TIPOS_ACEPTADOS, useFotoProtegida } from '@/acceso/fotos';
import { AvisoAcceso, Girando } from '@/acceso/marco-acceso';
import { clases } from '@/diseno/clases';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { ErrorApi, pedir } from '@/sesion/api';
import type { DatosNegocio, Demanda, FilaPrecio, MetodoPago, Vehiculo } from './formulario-negocio';

export function TablaPrecios({
  precios,
  alCambiar,
  movil,
}: {
  precios: DatosNegocio['precios'];
  alCambiar: (precios: DatosNegocio['precios']) => void;
  movil?: boolean;
}) {
  const cambiar = (codigo: CodigoMaterial, cambio: Partial<FilaPrecio>) =>
    alCambiar({ ...precios, [codigo]: { ...precios[codigo], ...cambio } });
  return (
    <div className="ac-tarjeta sin-relleno">
      {!movil && (
        <div className="ac-fila cabecera" aria-hidden="true">
          <span>Material</span>
          <span>Desde (S/ por kg)</span>
          <span>Hasta (S/ por kg)</span>
          <span>Demanda</span>
        </div>
      )}
      {CODIGOS_MATERIAL.map((codigo) => {
        const fila = precios[codigo];
        const nombre = NOMBRE_MATERIAL[codigo];
        return (
          <div key={codigo} className={clases('ac-fila', movil && 'movil')}>
            <label className="chk" style={{ fontWeight: 700, color: 'var(--ink)' }}>
              <input
                type="checkbox"
                checked={fila.activo}
                onChange={(evento) => cambiar(codigo, { activo: evento.target.checked })}
              />
              <span>{nombre}</span>
            </label>
            <div className="inp">
              {movil && <span>Desde S/</span>}
              <input
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Precio mínimo de ${nombre}`}
                disabled={!fila.activo}
                value={fila.min}
                onChange={(evento) => cambiar(codigo, { min: evento.target.value })}
              />
            </div>
            <div className="inp">
              {movil && <span>Hasta S/</span>}
              <input
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Precio máximo de ${nombre}`}
                disabled={!fila.activo}
                value={fila.max}
                onChange={(evento) => cambiar(codigo, { max: evento.target.value })}
              />
            </div>
            <div className="inp" style={movil ? { gridColumn: '1 / -1' } : undefined}>
              <select
                aria-label={`Demanda de ${nombre}`}
                disabled={!fila.activo}
                value={fila.demanda}
                onChange={(evento) => cambiar(codigo, { demanda: evento.target.value as Demanda })}
              >
                <option value="ALTA">{movil ? 'Demanda alta' : 'Alta'}</option>
                <option value="MEDIA">{movil ? 'Demanda media' : 'Media'}</option>
                <option value="BAJA">{movil ? 'Demanda baja' : 'Baja'}</option>
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Zona = { id: number; nombre: string; lat: number; lng: number };

function useZonas(): { zonas: Zona[] | null; error: string | null } {
  const [estado, setEstado] = useState<{ zonas: Zona[] | null; error: string | null }>({ zonas: null, error: null });
  useEffect(() => {
    let vigente = true;
    (async () => {
      const ciudades = await pedir<{ datos: Array<{ id: number; estado: string }> }>('/ciudades');
      const activa = ciudades.datos.find((ciudad) => ciudad.estado === 'ACTIVA');
      if (!activa) throw new Error('sin ciudad');
      return (await pedir<{ datos: Zona[] }>(`/ciudades/${activa.id}/zonas`)).datos;
    })()
      .then((zonas) => vigente && setEstado({ zonas, error: null }))
      .catch(() => vigente && setEstado({ zonas: null, error: 'No pudimos cargar las zonas. Recarga la página.' }));
    return () => {
      vigente = false;
    };
  }, []);
  return estado;
}

// La lista de zonas sale de la base de datos: cambiarla no requiere tocar la web
export function SelectorZona({
  etiqueta,
  zonaId,
  alCambiar,
  error,
  ayuda,
}: {
  etiqueta: string;
  zonaId: number | null;
  alCambiar: (zona: Zona) => void;
  error?: string;
  ayuda?: string;
}) {
  const id = useId();
  const { zonas, error: errorCarga } = useZonas();
  return (
    <div className={clases('field', (error ?? errorCarga) && 'err')}>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="inp">
        <Icono nombre="i-pin" />
        <select
          id={id}
          value={zonaId ?? ''}
          disabled={!zonas}
          onChange={(evento) => {
            const zona = zonas?.find((opcion) => opcion.id === Number(evento.target.value));
            if (zona) alCambiar(zona);
          }}
        >
          <option value="" disabled>
            {zonas ? 'Elige una zona' : 'Cargando zonas…'}
          </option>
          {(zonas ?? []).map((zona) => (
            <option key={zona.id} value={zona.id}>
              {zona.nombre}
            </option>
          ))}
        </select>
      </div>
      {ayuda && !(error ?? errorCarga) && <span className="hint">{ayuda}</span>}
      {(error ?? errorCarga) && (
        <span className="msg" role="alert">
          <Icono nombre="i-alert" tamano="sm" />
          {error ?? errorCarga}
        </span>
      )}
    </div>
  );
}

const DIAS = [
  ['L', 'Lunes'],
  ['M', 'Martes'],
  ['X', 'Miércoles'],
  ['J', 'Jueves'],
  ['V', 'Viernes'],
  ['S', 'Sábado'],
  ['D', 'Domingo'],
] as const;

export function SelectorDias({ dias, alCambiar }: { dias: number[]; alCambiar: (dias: number[]) => void }) {
  return (
    <div className="ac-dias" role="group" aria-label="Días de atención">
      {DIAS.map(([letra, nombre], indice) => {
        const dia = indice + 1;
        const marcado = dias.includes(dia);
        return (
          <button
            key={dia}
            type="button"
            className="ac-dia"
            aria-pressed={marcado}
            aria-label={nombre}
            onClick={() => alCambiar(marcado ? dias.filter((d) => d !== dia) : [...dias, dia])}
          >
            {letra}
          </button>
        );
      })}
    </div>
  );
}

const PAGOS: Array<[MetodoPago, string, NombreIcono]> = [
  ['EFECTIVO', 'Efectivo', 'i-cash'],
  ['YAPE', 'Yape', 'i-phone'],
  ['PLIN', 'Plin', 'i-phone'],
  ['TRANSFERENCIA', 'Transferencia', 'i-bank'],
];

export function SelectorPagos({ pagos, alCambiar }: { pagos: MetodoPago[]; alCambiar: (pagos: MetodoPago[]) => void }) {
  return (
    <div className="row g8 wr" role="group" aria-label="Métodos de pago">
      {PAGOS.map(([metodo, texto, icono]) => {
        const marcado = pagos.includes(metodo);
        return (
          <button
            key={metodo}
            type="button"
            className="cp"
            aria-pressed={marcado}
            onClick={() => alCambiar(marcado ? pagos.filter((p) => p !== metodo) : [...pagos, metodo])}
          >
            <Icono nombre={icono} tamano="sm" />
            {texto}
          </button>
        );
      })}
    </div>
  );
}

const VEHICULOS_TEXTO: Array<[Vehiculo, string, NombreIcono]> = [
  ['CAMION', 'Camión', 'i-truck'],
  ['TRICICLO', 'Triciclo', 'v-trike'],
  ['MOTO', 'Moto', 'v-moto'],
  ['CAMIONETA', 'Camioneta', 'v-van'],
];

export function SelectorVehiculo({
  vehiculo,
  alCambiar,
}: {
  vehiculo: Vehiculo;
  alCambiar: (vehiculo: Vehiculo) => void;
}) {
  return (
    <div className="row g8 wr" role="group" aria-label="Vehículo">
      {VEHICULOS_TEXTO.map(([valor, texto, icono]) => (
        <button
          key={valor}
          type="button"
          className="cp"
          aria-pressed={vehiculo === valor}
          onClick={() => alCambiar(valor)}
        >
          <Icono nombre={icono} tamano="sm" />
          {texto}
        </button>
      ))}
    </div>
  );
}

function VistaFoto({ id, local }: { id: string; local?: string }) {
  const remota = useFotoProtegida(local ? null : id);
  const url = local ?? remota;
  // eslint-disable-next-line @next/next/no-img-element -- foto privada servida desde memoria
  return url ? <img alt="Foto del negocio" src={url} /> : <Girando oscuro />;
}

// Hasta 3 fotos: se suben al elegirlas y viajan con el registro
export function SelectorFotos({
  fotos,
  alCambiar,
  etiquetas = ['Foto del local', 'Foto 2', 'Foto 3'],
  proposito = 'NEGOCIO',
}: {
  fotos: string[];
  alCambiar: (fotos: string[]) => void;
  etiquetas?: string[];
  proposito?: 'NEGOCIO' | 'PUBLICACION';
}) {
  const [locales, setLocales] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useMemo(() => Object.values(locales), [locales]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);

  const elegir = async (indice: number, archivo: File | undefined) => {
    if (!archivo) return;
    setError(null);
    setSubiendo(indice);
    try {
      const subida = await subirFoto(archivo, proposito);
      setLocales((actuales) => ({ ...actuales, [subida.id]: URL.createObjectURL(archivo) }));
      const lista = [...fotos];
      const anterior = lista[indice];
      lista[indice] = subida.id;
      alCambiar(lista.filter(Boolean));
      if (anterior) void quitar(anterior, false);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos subir la foto. Intenta de nuevo.');
    } finally {
      setSubiendo(null);
    }
  };

  const quitar = async (id: string, actualizar = true) => {
    if (actualizar) alCambiar(fotos.filter((foto) => foto !== id));
    try {
      await quitarFoto(id);
    } catch {
      // Si ya estaba en el registro enviado, se reemplaza al reenviar
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="ac-fotos">
        {Array.from({ length: MAXIMO_FOTOS_NEGOCIO }, (_, indice) => {
          const id = fotos[indice];
          const deshabilitada = indice > fotos.length;
          return (
            <div key={indice} style={{ position: 'relative' }}>
              <label
                className="ac-foto"
                aria-disabled={deshabilitada}
                style={deshabilitada ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                {subiendo === indice ? (
                  <Girando oscuro />
                ) : id ? (
                  <VistaFoto id={id} local={locales[id]} />
                ) : (
                  <>
                    <Icono nombre="i-camera" tamano="lg" />
                    {etiquetas[indice]}
                  </>
                )}
                <input
                  type="file"
                  accept={TIPOS_ACEPTADOS}
                  disabled={deshabilitada || subiendo !== null}
                  aria-label={
                    id ? `Cambiar ${etiquetas[indice]?.toLowerCase()}` : `Subir ${etiquetas[indice]?.toLowerCase()}`
                  }
                  onChange={(evento) => {
                    void elegir(indice, evento.target.files?.[0]);
                    evento.target.value = '';
                  }}
                />
              </label>
              {id && subiendo !== indice && (
                <button
                  type="button"
                  className="ac-quitar-foto"
                  aria-label={`Quitar ${etiquetas[indice]?.toLowerCase()}`}
                  onClick={() => void quitar(id)}
                >
                  <Icono nombre="i-close" tamano="sm" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <span className="hint">
        JPG, PNG o WebP. Las achicamos y les quitamos la ubicación y otros datos ocultos antes de guardarlas.
      </span>
      {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
    </div>
  );
}
