'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

type Pregunta = { tema: string; pregunta: string; respuesta: string; para?: 'reciclador' | 'negocio' };

// Respuestas alineadas con las reglas del producto: semáforo (C2), desafíos mensuales, pagos fuera de la app
export const PREGUNTAS: Pregunta[] = [
  {
    tema: 'Semáforo',
    pregunta: '¿Qué significa el semáforo de precios?',
    respuesta:
      'Compara el precio de un material entre quienes lo compran cerca de ti. «Mejor precio» es el tercio más alto, «Precio intermedio» el del medio y «Precio bajo» el más bajo. No dice si un precio es justo, solo cómo se ve frente a los demás.',
  },
  {
    tema: 'Semáforo',
    pregunta: '¿Qué pasa si solo hay dos compradores?',
    respuesta:
      'Con dos opciones, la que paga más se marca «Mejor precio» y la otra «Precio bajo». Si hay una sola opción o todas pagan lo mismo, se muestra «Sin comparación».',
  },
  {
    tema: 'Semáforo',
    pregunta: '¿Qué son las barras de demanda?',
    respuesta:
      'Es cuánto se busca ese material: alta, media o baja. Es independiente del precio; un precio bajo puede tener demanda alta.',
  },
  {
    tema: 'Publicar',
    pregunta: '¿Cuánto dura una publicación?',
    respuesta: '7 días. Puedes renovarla desde «Mis publicaciones» si todavía tienes el material.',
    para: 'reciclador',
  },
  {
    tema: 'Publicar',
    pregunta: '¿Puedo editar una publicación que ya tiene ofertas?',
    respuesta:
      'No. Mientras tenga ofertas pendientes solo puedes aceptar una, rechazarlas o cancelar la publicación. Sin ofertas pendientes sí puedes cambiar el peso, el precio y las fotos.',
    para: 'reciclador',
  },
  {
    tema: 'Puntos',
    pregunta: '¿Cómo gano puntos?',
    respuesta:
      '1 punto por cada kilo de una operación completada. También con los desafíos del mes y con premios de la ruleta.',
    para: 'reciclador',
  },
  {
    tema: 'Puntos',
    pregunta: '¿Cuándo puedo girar la ruleta?',
    respuesta:
      'Cada 500 puntos ganados reciclando te dan un giro, y cumplir la meta del mes te da uno extra. Los giros no vencen.',
    para: 'reciclador',
  },
  {
    tema: 'Puntos',
    pregunta: '¿Cada cuánto cambian los desafíos?',
    respuesta: 'Los desafíos son mensuales: cada mes empiezan nuevos y se cierran el último día.',
    para: 'reciclador',
  },
  {
    tema: 'Privacidad',
    pregunta: '¿Quién ve mi ubicación?',
    respuesta:
      'Nadie ve tu ubicación exacta. Los compradores ven tu ciudad y una distancia aproximada. Cuando aceptas una oferta, tú eliges el punto de encuentro y se comparte tu WhatsApp.',
  },
  {
    tema: 'Privacidad',
    pregunta: '¿Se hacen pagos dentro de RecicloMap?',
    respuesta:
      'No. El pago se acuerda y se hace en persona, con el medio que acepten (efectivo, Yape, Plin o transferencia). RecicloMap solo conecta y ordena el proceso.',
  },
  {
    tema: 'Privacidad',
    pregunta: '¿RecicloMap me escribe por WhatsApp?',
    respuesta:
      'No. Los avisos llegan solo dentro de la app (y al celular si activas las notificaciones). WhatsApp lo usan el reciclador y el negocio entre ellos para coordinar, después de aceptar una oferta.',
  },
  {
    tema: 'Operaciones',
    pregunta: '¿Qué hago si el peso no coincide?',
    respuesta:
      'Cuando el comprador confirme los kilos, elige «No conforme» en el seguimiento. Se detiene el plazo y un administrador revisa el caso. El administrador nunca cambia el peso: le pide al comprador corregirlo o decide cerrar o anular.',
  },
  {
    tema: 'Operaciones',
    pregunta: '¿Qué pasa si no respondo a la confirmación de kilos?',
    respuesta:
      'Si en 72 horas no das tu conformidad ni marcas «No conforme», la operación se completa sola con esos kilos.',
  },
  {
    tema: 'Cuenta',
    pregunta: '¿Cómo se verifica un centro o comprador móvil?',
    respuesta: 'Un administrador revisa sus datos y fotos. Solo los verificados aparecen en el mapa.',
  },
  {
    tema: 'Cuenta',
    pregunta: '¿Qué hago si un precio es incorrecto?',
    respuesta:
      'Usa «Reportar información» en el detalle del negocio. Un administrador lo revisa: puede pedir al dueño que lo corrija o suspender su visibilidad, pero nunca cambia el precio. El negocio no sabe quién lo reportó.',
  },
  {
    tema: 'Cuenta',
    pregunta: '¿Cómo cambio mi número?',
    respuesta:
      'Desde «Editar perfil» o «Configuración». Te enviamos un código por SMS al número nuevo y el cambio se aplica cuando lo confirmas.',
  },
  {
    tema: 'Cuenta',
    pregunta: 'Olvidé mi contraseña',
    respuesta: 'En «Iniciar sesión» toca «Olvidé mi contraseña» y sigue los pasos.',
  },
  {
    tema: 'Negocio',
    pregunta: '¿Quién puede cambiar mis precios?',
    respuesta:
      'Solo tú, desde «Precios y demanda». El administrador puede marcarlos, pedirte una corrección con plazo o suspender su visibilidad, siempre con un motivo, pero no puede editarlos.',
    para: 'negocio',
  },
  {
    tema: 'Negocio',
    pregunta: '¿Por qué mi cambio de dirección no aparece todavía?',
    respuesta:
      'Los cambios de dirección o del pin pasan por verificación para evitar negocios falsos. Mientras tanto sigues visible con tu dirección anterior.',
    para: 'negocio',
  },
];

// Pantalla 38
function Contenido() {
  const { usuario } = useSesion();
  const { configuracion } = useConfiguracionPublica();
  const esNegocio = usuario?.rol === 'CENTRO' || usuario?.rol === 'COMPRADOR_MOVIL';
  const visibles = PREGUNTAS.filter((p) => !p.para || (p.para === 'negocio' ? esNegocio : !esNegocio));
  const temas = ['Todas', ...new Set(visibles.map((p) => p.tema))];
  const [tema, setTema] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set([0]));
  const termino = busqueda.trim().toLowerCase();
  const lista = visibles
    .map((p, indice) => ({ ...p, indice }))
    .filter(
      (p) =>
        (tema === 'Todas' || p.tema === tema) &&
        (!termino || `${p.pregunta} ${p.respuesta}`.toLowerCase().includes(termino)),
    );
  const correo = configuracion?.soporte?.correo ?? 'soporte@reciclomap.pe';

  return (
    <>
      <EncabezadoPagina
        antetitulo="Centro de ayuda"
        titulo="¿En qué te"
        resaltado="ayudamos?"
        descripcion="Respuestas cortas a lo que más nos preguntan. Si no está aquí, escríbenos."
      />
      <div className="panel" style={{ background: 'var(--mint)', marginBottom: 24 }}>
        <div className="inp" style={{ height: 56, maxWidth: 640 }}>
          <Icono nombre="i-search" />
          <input
            aria-label="Buscar en la ayuda"
            placeholder="Busca: semáforo, puntos, publicar, ubicación…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ fontSize: 17 }}
          />
        </div>
        <div className="row g8 wr" style={{ marginTop: 14 }} role="group" aria-label="Temas">
          {temas.map((t) => (
            <button key={t} type="button" className="cp" aria-pressed={t === tema} onClick={() => setTema(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="cols">
        <section className="list" style={{ gap: 12 }}>
          {lista.length === 0 && (
            <div className="empty">
              <b>No encontramos esa pregunta</b>
              <span className="mini">Prueba con otra palabra o escríbenos.</span>
            </div>
          )}
          {lista.map((p) => {
            const abierta = abiertas.has(p.indice);
            return (
              <div
                key={p.pregunta}
                className="panel"
                style={{ padding: 0, boxShadow: '3px 3px 0 var(--ink)' }}
                data-pregunta
              >
                <button
                  type="button"
                  aria-expanded={abierta}
                  onClick={() =>
                    setAbiertas((actuales) => {
                      const siguiente = new Set(actuales);
                      if (abierta) siguiente.delete(p.indice);
                      else siguiente.add(p.indice);
                      return siguiente;
                    })
                  }
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    background: 'none',
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    font: '700 16px var(--head)',
                    color: 'var(--ink)',
                  }}
                >
                  <span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        letterSpacing: '.1em',
                        color: 'var(--deep)',
                        display: 'block',
                        textTransform: 'uppercase',
                      }}
                    >
                      {p.tema}
                    </span>
                    {p.pregunta}
                  </span>
                  <span style={{ transform: `rotate(${abierta ? 180 : 0}deg)`, transition: '.2s' }} aria-hidden="true">
                    <Icono nombre="i-down" />
                  </span>
                </button>
                {abierta && <div style={{ padding: '0 20px 18px', color: 'var(--text)' }}>{p.respuesta}</div>}
              </div>
            );
          })}
        </section>
        <aside className="stack">
          <div className="panel">
            <h3>¿No encontraste lo que buscabas?</h3>
            <p className="mini" style={{ marginBottom: 12 }}>
              Escríbenos por correo. Respondemos en horario de oficina.
            </p>
            <a
              className="btn p"
              style={{ width: '100%' }}
              href={`mailto:${correo}?subject=${encodeURIComponent('Ayuda con RecicloMap')}`}
            >
              <Icono nombre="i-mail" />
              Escribir a soporte
            </a>
          </div>
          {!esNegocio && (
            <div className="panel">
              <h3>Guías rápidas</h3>
              <div className="list" style={{ gap: 8 }}>
                {[
                  [RUTAS.publicar, 'Publicar tu primer material'],
                  [RUTAS.calculadora, 'Calcular cuánto te pagan'],
                  [RUTAS.favoritos, 'Guardar tus favoritos'],
                ].map(([ruta, texto]) => (
                  <Link
                    key={ruta}
                    className="row g8"
                    href={ruta!}
                    style={{ color: 'var(--deep)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    <Icono nombre="i-arrow-right" tamano="sm" />
                    {texto}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

export function Ayuda() {
  return (
    <Protegida invitado pasos={['LISTO', 'ESPERAR_VERIFICACION', 'ELEGIR_MATERIALES', 'COMPLETAR_NEGOCIO']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
