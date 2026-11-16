'use client';

import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { ACTUALIZADO, SECCIONES } from './textos-legales';

const RESUMEN = [
  { titulo: 'Pagos', icono: 'i-cash', valor: 'Ninguno', detalle: 'se paga en persona' },
  { titulo: 'Ubicación', icono: 'i-pin', valor: 'Aproximada', detalle: 'hasta aceptar una oferta' },
  { titulo: 'Precios', icono: 'i-lock', valor: 'Del dueño', detalle: 'admin no los edita' },
  { titulo: 'Tus datos', icono: 'i-shield', valor: 'Tuyos', detalle: 'puedes borrarlos' },
] as const;

// Página pública: se lee con o sin cuenta y llega completa desde el servidor
export function Terminos() {
  return (
    <MarcoApp>
      <div className="ph">
        <div>
          <span className="kick">Legal en palabras simples</span>
          <h1>
            Términos y <u>privacidad</u>
          </h1>
          <p>Qué hace RecicloMap, qué datos guarda y cómo los cuida. Última actualización: {ACTUALIZADO}.</p>
        </div>
      </div>
      <div className="note warn" role="note" style={{ marginBottom: 24 }}>
        <Icono nombre="i-alert" />
        <span>
          <b>Texto provisional, pendiente de revisión legal.</b> Puede cambiar antes del lanzamiento; te avisaremos si
          cambia.
        </span>
      </div>
      <div className="grid4" style={{ marginBottom: 28 }}>
        {RESUMEN.map((item) => (
          <div key={item.titulo} className="kpi">
            <div className="l">
              {item.titulo} <Icono nombre={item.icono} />
            </div>
            <div className="v" style={{ fontSize: 28 }}>
              {item.valor}
            </div>
            <div className="d">{item.detalle}</div>
          </div>
        ))}
      </div>
      <div className="cols l">
        <aside>
          <nav className="panel" style={{ position: 'sticky', top: 90 }} aria-label="Contenido">
            <b style={{ font: '800 16px var(--head)', color: 'var(--ink)' }}>Contenido</b>
            <div className="list" style={{ gap: 2, marginTop: 10 }}>
              {SECCIONES.map((seccion) => (
                <a
                  key={seccion.id}
                  href={`#${seccion.id}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {seccion.titulo}
                </a>
              ))}
            </div>
          </nav>
        </aside>
        <section className="panel">
          {SECCIONES.map((seccion) => (
            <div
              key={seccion.id}
              id={seccion.id}
              style={{
                scrollMarginTop: 90,
                paddingBottom: 22,
                marginBottom: 22,
                borderBottom: '1.5px dashed var(--line)',
              }}
            >
              <h2 style={{ font: '800 22px var(--head)', marginBottom: 8 }}>{seccion.titulo}</h2>
              {seccion.parrafos.map((parrafo) => (
                <p key={parrafo.slice(0, 24)} style={{ marginTop: 8 }}>
                  {parrafo}
                </p>
              ))}
              {seccion.pendiente && (
                <p className="note warn" style={{ marginTop: 10 }}>
                  <Icono nombre="i-alert" />
                  <b>{seccion.pendiente}</b>
                </p>
              )}
            </div>
          ))}
          <div className="note">
            <Icono nombre="i-info" />
            <span>
              Texto provisional, pendiente de revisión legal. No reemplaza la versión definitiva que se publicará antes
              del lanzamiento.
            </span>
          </div>
        </section>
      </div>
    </MarcoApp>
  );
}
