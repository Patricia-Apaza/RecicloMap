'use client';

import { CODIGOS_MATERIAL, type CodigoMaterial, NOMBRE_MATERIAL } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useState } from 'react';
import { EncabezadoPagina, EstadoVacio } from '@/diseno/bloques';
import { Ficha } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { type RangoPropio, usePublicacionesCercanas } from '@/publicaciones/cercanas';
import { DialogoOferta } from '@/publicaciones/dialogo-oferta';
import { diasTexto, FichaMaterial, kilos, soles, TarjetaReciclador } from '@/publicaciones/piezas';
import type { PublicacionCercana } from '@/publicaciones/tipos';
import { Protegida } from '@/sesion/protegida';

export function EstadoMiOferta({ publicacion, alOfertar }: { publicacion: PublicacionCercana; alOfertar: () => void }) {
  const mia = publicacion.miOferta;
  if (mia?.estado === 'PENDIENTE') {
    return (
      <div className="row g8 wr">
        <span className="pill open">
          <i />
          Oferta enviada · {soles(mia.precioKg)} por kg
        </span>
        <button type="button" className="btn sm" onClick={alOfertar}>
          Cambiar oferta
        </button>
      </div>
    );
  }
  if (mia?.estado === 'RECHAZADA' || mia?.estado === 'NO_SELECCIONADA') {
    return <span className="pill grey">Tu oferta no fue seleccionada</span>;
  }
  return (
    <button type="button" className="btn p sm" onClick={alOfertar} style={{ alignSelf: 'flex-start' }}>
      {mia?.estado === 'RETIRADA' ? 'Volver a ofertar' : 'Hacer oferta'}
    </button>
  );
}

function Tarjeta({ publicacion, alOfertar }: { publicacion: PublicacionCercana; alOfertar: () => void }) {
  const p = publicacion;
  return (
    <article
      className="panel"
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
      data-cercana={p.id}
    >
      <div className="row g16">
        <FichaMaterial codigo={p.material.codigo} tamano={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`${RUTAS.publicacionesCercanas}/${p.id}`}
            style={{ font: '800 22px var(--head)', color: 'var(--ink)', textDecoration: 'none' }}
          >
            {p.material.nombre} · {kilos(p.kg)} kg
          </Link>
          <div className="mini row wr g8" style={{ marginTop: 2 }}>
            <Icono nombre="i-pin" tamano="sm" /> {p.reciclador.ciudad} · a {p.tramo ?? 'distancia no disponible'}
            <span className="pill grey">Ubicación aproximada</span>
          </div>
        </div>
      </div>
      <div className="row sp wr">
        <span>
          {p.precioEsperado ? (
            <>
              Espera <b className="mono">{soles(p.precioEsperado)}</b> por kg
            </>
          ) : (
            'Sin precio esperado'
          )}
        </span>
        <span className={p.diasRestantes <= 2 ? 'pill warn' : 'pill blue'}>
          <Icono nombre="i-clock" tamano="sm" /> Vence en {diasTexto(p.diasRestantes)}
        </span>
      </div>
      {p.nota && (
        <p className="mini" style={{ margin: 0 }}>
          “{p.nota}”
        </p>
      )}
      <TarjetaReciclador reciclador={p.reciclador} compacta />
      {!p.compraEsteMaterial && (
        <div className="note warn">
          <Icono nombre="i-info" />
          <span>No tienes este material activo, pero puedes ofertar igual.</span>
        </div>
      )}
      <div className="row sp wr g8">
        <EstadoMiOferta publicacion={p} alOfertar={alOfertar} />
        <Link className="btn ghost sm" href={`${RUTAS.publicacionesCercanas}/${p.id}`}>
          Ver detalle
        </Link>
      </div>
    </article>
  );
}

function Contenido() {
  const [material, setMaterial] = useState<CodigoMaterial | null>(null);
  const { datos, total, rangos, error, recargar, cargarMas, hayMas } = usePublicacionesCercanas(material);
  const [ofertando, setOfertando] = useState<PublicacionCercana | null>(null);

  return (
    <>
      <EncabezadoPagina
        antetitulo="Publicaciones cercanas"
        titulo="Material que"
        resaltado="te están ofreciendo"
        descripcion="Ves la ciudad y una distancia aproximada. El contacto del reciclador se libera si acepta tu oferta."
        acciones={
          <Link className="btn" href={RUTAS.ofertasEnviadas}>
            Ofertas enviadas
          </Link>
        }
      />
      <div className="row wr g8" role="group" aria-label="Material" style={{ marginBottom: 20 }}>
        <Ficha presionada={material === null} alPresionar={() => setMaterial(null)}>
          Todo
        </Ficha>
        {CODIGOS_MATERIAL.map((codigo) => (
          <Ficha key={codigo} presionada={material === codigo} alPresionar={() => setMaterial(codigo)}>
            {NOMBRE_MATERIAL[codigo]}
          </Ficha>
        ))}
      </div>
      {error && (
        <div className="note warn" role="alert">
          <Icono nombre="i-alert" />
          <span>No pudimos cargar las publicaciones. Recarga la página.</span>
        </div>
      )}
      {!datos && !error && <span className="girando" role="status" aria-label="Cargando" />}
      {datos?.length === 0 && (
        <EstadoVacio
          icono="i-recycle"
          titulo="No hay publicaciones abiertas"
          descripcion={
            material
              ? `Nadie está ofreciendo ${NOMBRE_MATERIAL[material]} en tu ciudad por ahora.`
              : 'Te avisaremos cuando un reciclador publique material cerca de ti.'
          }
        />
      )}
      <div className="grid2">
        {datos?.map((publicacion) => (
          <Tarjeta key={publicacion.id} publicacion={publicacion} alOfertar={() => setOfertando(publicacion)} />
        ))}
      </div>
      {datos && datos.length > 0 && (
        <div className="row g8 wr" style={{ justifyContent: 'center', marginTop: 20 }}>
          <span className="mini">
            Mostrando {datos.length} de {total}
          </span>
          {hayMas && (
            <button type="button" className="btn sm" onClick={() => void cargarMas()}>
              Ver más publicaciones
            </button>
          )}
        </div>
      )}
      <DialogoOferta
        key={ofertando?.id ?? 'ninguna'}
        objetivo={
          ofertando
            ? { ...ofertando, miPrecio: (rangos as Record<string, RangoPropio>)[ofertando.material.codigo] ?? null }
            : null
        }
        actual={ofertando?.miOferta ?? null}
        alCerrar={() => setOfertando(null)}
        alEnviar={() => {
          setOfertando(null);
          void recargar();
        }}
      />
    </>
  );
}

export function PublicacionesCercanas() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp activa="pubs">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
