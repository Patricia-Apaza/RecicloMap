'use client';

import { type Disponibilidad, formatearTelefono, TEXTO_DISPONIBILIDAD } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useEffect, useState } from 'react';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina, Estrellas } from '@/diseno/bloques';
import { Interruptor } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { Calificacion } from '@/mapa/piezas';
import { TEXTO_PAGO, TEXTO_VEHICULO } from '@/mapa/resultados';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import type { CalificacionPublica, Resena } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { iniciales } from '@/sesion/rutas-sesion';

type Inicio = {
  nombre: string;
  disponibilidad: Disponibilidad;
  mostrarZona: boolean;
  zona: { nombre: string } | null;
  indicadores: { calificacion: CalificacionPublica };
};
type Datos = {
  nombreComercial: string;
  whatsapp: string;
  vehiculo: string | null;
  horario: { habitual: { abre: string; cierra: string } | null };
  pagos: string[];
};

// Pantalla 55: así te ven los recicladores. Los datos se editan en «Datos y horarios»; los precios, en «Mis precios»
function Contenido() {
  const aviso = useAviso();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [plan, setPlan] = useState<'GRATIS' | 'PRO' | null>(null);
  const [resenas, setResenas] = useState<Resena[]>([]);

  useEffect(() => {
    let vigente = true;
    pedir<Inicio>('/comprador/inicio')
      .then((r) => vigente && setInicio(r))
      .catch(() => undefined);
    pedir<Datos>('/mi-negocio/datos')
      .then((r) => vigente && setDatos(r))
      .catch(() => undefined);
    pedir<{ plan: 'GRATIS' | 'PRO' }>('/mi-negocio/estadisticas?periodo=7')
      .then((r) => vigente && setPlan(r.plan))
      .catch(() => undefined);
    pedir<{ datos: Resena[] }>('/mi-negocio/resenas?filtro=todas')
      .then((r) => vigente && setResenas(r.datos.slice(0, 2)))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const mostrar = async (mostrarZona: boolean) => {
    try {
      setInicio(await pedir<Inicio>('/mi-negocio/estado-movil', { metodo: 'PUT', cuerpo: { mostrarZona } }));
      aviso(mostrarZona ? 'Apareces en el mapa con tu zona aproximada' : 'Dejaste de aparecer en el mapa');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el cambio.');
    }
  };

  if (!inicio || !datos) return <span className="girando" role="status" aria-label="Cargando" />;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Comprador móvil"
        titulo="Tu"
        resaltado="perfil"
        descripcion="Así te ven los recicladores en el mapa. Los precios se editan en «Mis precios»."
        acciones={
          <span className="pill open">
            <i />
            Verificado
          </span>
        }
      />
      <div className="cols l">
        <aside className="stack">
          <div className="panel" style={{ textAlign: 'center', background: 'var(--mint)' }} data-perfil>
            <span
              className="ico"
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                margin: '0 auto',
                background: 'var(--sky)',
                font: '800 28px var(--head)',
              }}
              aria-hidden="true"
            >
              {iniciales(datos.nombreComercial)}
            </span>
            <h2 style={{ display: 'block', margin: '12px 0 2px', font: '800 24px var(--head)' }}>
              {datos.nombreComercial}
            </h2>
            <div className="mini" style={{ color: 'var(--ink)' }}>
              {inicio.zona?.nombre ?? 'Sin zona'} ·{' '}
              {datos.vehiculo ? (TEXTO_VEHICULO[datos.vehiculo] ?? datos.vehiculo) : 'Móvil'}
            </div>
            <div className="row g8" style={{ justifyContent: 'center', marginTop: 12 }}>
              <span
                className={
                  inicio.disponibilidad === 'DISPONIBLE'
                    ? 'pill open'
                    : inicio.disponibilidad === 'EN_RUTA'
                      ? 'pill warn'
                      : 'pill closed'
                }
              >
                <i />
                {TEXTO_DISPONIBILIDAD[inicio.disponibilidad]}
              </span>
              <Calificacion
                calificacion={{
                  ...inicio.indicadores.calificacion,
                  promedio:
                    inicio.indicadores.calificacion.promedio === null
                      ? null
                      : Number(inicio.indicadores.calificacion.promedio),
                }}
              />
            </div>
          </div>
          <div className="panel">
            <h3>Plan</h3>
            <div className="row sp">
              <b>{plan === 'PRO' ? 'Pro' : 'Gratis'}</b>
              <span className={plan === 'PRO' ? 'pill pro' : 'pill grey'}>Actual</span>
            </div>
            <p className="mini" style={{ margin: '8px 0 12px' }}>
              El plan Pro solo cambia tu orden por defecto y suma la etiqueta «Destacado». No cambia tus precios ni el
              semáforo.
            </p>
            <Link className="btn sm" href={RUTAS.planAvisos}>
              Plan y avisos
            </Link>
          </div>
          <div className="panel">
            <h3>Reseñas recientes</h3>
            <div className="list" style={{ gap: 12 }}>
              {resenas.length === 0 && <p className="mini">Aún no tienes reseñas.</p>}
              {resenas.map((r) => (
                <div key={r.id}>
                  <div className="row sp">
                    <b>{r.autor}</b>
                    <Estrellas valor={r.estrellas} />
                  </div>
                  {r.comentario && <p className="mini">«{r.comentario}»</p>}
                </div>
              ))}
            </div>
            <Link className="btn sm" href={RUTAS.resenasRecibidas} style={{ marginTop: 12 }}>
              Ver todas
            </Link>
          </div>
        </aside>
        <section className="stack">
          <div className="panel" data-datos-publicos>
            <div className="row sp wr">
              <h2 style={{ margin: 0 }}>Datos públicos</h2>
              <Link className="btn sm" href={RUTAS.datosHorarios}>
                Editar datos y horario
              </Link>
            </div>
            <div className="list" style={{ gap: 0, marginTop: 10 }}>
              {[
                ['WhatsApp', formatearTelefono(datos.whatsapp)],
                [
                  'Horario habitual',
                  datos.horario.habitual
                    ? `${datos.horario.habitual.abre} – ${datos.horario.habitual.cierra}`
                    : 'Sin indicar',
                ],
                ['Medios de pago', datos.pagos.map((p) => TEXTO_PAGO[p] ?? p).join(', ') || 'Sin indicar'],
              ].map(([etiqueta, valor]) => (
                <div
                  key={etiqueta}
                  className="row sp"
                  style={{ padding: '10px 0', borderBottom: '1.5px solid var(--line)' }}
                >
                  <span className="mini">{etiqueta}</span>
                  <b style={{ textAlign: 'right' }}>{valor}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <Interruptor
              etiqueta="Mostrarme en el mapa"
              marcado={inicio.mostrarZona}
              alCambiar={(valor) => void mostrar(valor)}
            />
            <span className="mini" style={{ display: 'block', marginTop: 4 }}>
              Con la zona aproximada, nunca tu ubicación exacta.
            </span>
          </div>
          <div className="panel">
            <h2>Cuenta</h2>
            <div className="row sp wr g16">
              <span className="mini">Correo, contraseña y teléfono se cambian en Configuración.</span>
              <Link className="btn sm" href={RUTAS.configuracion}>
                Configuración
              </Link>
            </div>
          </div>
          <div className="note">
            <Icono nombre="i-info" />
            <span>
              La ruta y la posición de hoy se gestionan en «Zona y ruta del día»; se borran solas al terminar el día.
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

export function PerfilMovil() {
  return (
    <Protegida roles={['COMPRADOR_MOVIL']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
