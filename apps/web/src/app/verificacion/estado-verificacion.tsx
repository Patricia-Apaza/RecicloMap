'use client';

import { enlaceWhatsApp, formatearFechaHora } from '@reciclomap/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvisoAcceso, MarcoAcceso } from '@/acceso/marco-acceso';
import { clases } from '@/diseno/clases';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { LogoMarca } from '@/diseno/logo';
import { RUTAS } from '@/navegacion/rutas';
import { pedir } from '@/sesion/api';
import { PantallaCargando, Protegida } from '@/sesion/protegida';
import { INICIO_ROL, TEXTO_ROL } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

const SOPORTE = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP;

const LADO = {
  antetitulo: 'Verificación',
  titulo: 'Estamos cuidando',
  resaltado: 'la confianza del mapa.',
  texto:
    'Un administrador revisa cada centro y comprador antes de mostrarlo, para que todos negocien con tranquilidad.',
  chips: [
    { icono: 'i-shield' as const, texto: 'Perfiles verificados' },
    { icono: 'i-clock' as const, texto: 'Menos de 24 horas' },
  ],
};

export type EstadoVerificacion = 'EN_REVISION' | 'INFO_PEDIDA' | 'RECHAZADO' | 'APROBADO';

type Respuesta = {
  negocio: {
    tipo: 'CENTRO' | 'MOVIL';
    nombreComercial: string;
    direccion: string | null;
    zona: { nombre: string } | null;
  } | null;
  verificacion: { estado: EstadoVerificacion; motivo: string | null; mensaje: string | null; creadaEn: string } | null;
};

type Paso = 'hecho' | 'ahora' | 'mal' | '';

export const CONTENIDO: Record<
  EstadoVerificacion,
  { icono: NombreIcono; tono: string; titulo: string; texto: string; pasos: [Paso, Paso, Paso]; detalle: string }
> = {
  EN_REVISION: {
    icono: 'i-clock',
    tono: 'espera',
    titulo: 'Estamos revisando tu perfil',
    texto: 'Suele tardar menos de 24 horas. Te avisaremos en la app y por SMS cuando esté listo.',
    pasos: ['hecho', 'ahora', ''],
    detalle: 'Un administrador revisa tus datos y fotos',
  },
  INFO_PEDIDA: {
    icono: 'i-info',
    tono: 'info',
    titulo: 'Necesitamos más información',
    texto: 'Un administrador pidió completar un dato. Revísalo, complétalo y vuelve a enviarlo.',
    pasos: ['hecho', 'ahora', ''],
    detalle: 'Falta completar un dato',
  },
  RECHAZADO: {
    icono: 'i-alert',
    tono: 'mal',
    titulo: 'Necesitamos corregir un dato',
    texto: 'No pudimos verificar tu perfil todavía. Corrige lo indicado y vuelve a enviarlo.',
    pasos: ['hecho', 'mal', ''],
    detalle: 'Requiere corrección',
  },
  APROBADO: {
    icono: 'i-check',
    tono: 'bien',
    titulo: '¡Tu perfil está verificado!',
    texto: 'Ya apareces en el mapa y puedes recibir publicaciones cercanas.',
    pasos: ['hecho', 'hecho', 'hecho'],
    detalle: 'Un administrador revisó tus datos y fotos',
  },
};

function Pasos({ pasos, detalle }: { pasos: [Paso, Paso, Paso]; detalle: string }) {
  const nombres = ['Enviado', 'En revisión', 'Verificado'];
  const textos = ['Recibimos tus datos', detalle, 'Aparecerás en el mapa'];
  return (
    <ol
      className="ac-linea"
      aria-label="Estado de la verificación"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {nombres.map((nombre, indice) => {
        const estado = pasos[indice]!;
        return (
          <li key={nombre}>
            <div className={clases('ac-vpaso', estado)}>
              <span className="dot">
                {estado === 'hecho' ? (
                  <Icono nombre="i-check" tamano="sm" />
                ) : estado === 'mal' ? (
                  <Icono nombre="i-close" tamano="sm" />
                ) : (
                  indice + 1
                )}
              </span>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{nombre}</p>
                <p className="mini" style={{ fontSize: 13 }}>
                  {textos[indice]}
                </p>
              </div>
            </div>
            {indice < 2 && <div className={clases('ac-vlinea', estado === 'hecho' && 'hecho')} />}
          </li>
        );
      })}
    </ol>
  );
}

function Contenido() {
  const router = useRouter();
  const { usuario, cerrar, actualizar } = useSesion();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    pedir<Respuesta>('/mi-negocio')
      .then((respuesta) => {
        if (!vigente) return;
        setDatos(respuesta);
        // Si el administrador ya decidió, la sesión debe reflejar el paso nuevo
        if (respuesta.verificacion?.estado === 'APROBADO') void actualizar();
      })
      .catch(() => vigente && setError('No pudimos cargar el estado de tu verificación. Recarga la página.'));
    return () => {
      vigente = false;
    };
  }, [actualizar]);

  if (!usuario) return null;
  const negocio = datos?.negocio;
  const verificacion = datos?.verificacion;
  const estado = verificacion?.estado ?? 'EN_REVISION';
  const contenido = CONTENIDO[estado];
  const rutaCorregir = `${usuario.rol === 'COMPRADOR_MOVIL' ? RUTAS.registroComprador : RUTAS.registroCentro}?corregir=1`;
  const esCentro = negocio?.tipo !== 'MOVIL';

  return (
    <MarcoAcceso lado={LADO}>
      <div className="ac-barra">
        <LogoMarca tamano={36} />
        <span className="pill grey">{TEXTO_ROL[usuario.rol]}</span>
      </div>
      {!datos && !error ? (
        <PantallaCargando />
      ) : (
        <>
          <div className="ac-pad crece">
            {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
            <div className="stack" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span className={clases('ac-heroe', contenido.tono)}>
                <Icono nombre={contenido.icono} />
              </span>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px,3vw,34px)', lineHeight: 1.1 }}>{contenido.titulo}</h1>
              <p style={{ margin: 0, color: 'var(--muted)' }}>{contenido.texto}</p>
            </div>
            {(estado === 'RECHAZADO' || estado === 'INFO_PEDIDA') && verificacion?.motivo && (
              <AvisoAcceso tono={estado === 'RECHAZADO' ? 'err' : 'info'}>
                <b>{estado === 'RECHAZADO' ? 'Motivo del rechazo' : 'Lo que falta'}</b>: {verificacion.motivo}.
                {verificacion.mensaje && (
                  <>
                    <br />
                    <span>{verificacion.mensaje}</span>
                  </>
                )}
              </AvisoAcceso>
            )}
            <div className="ac-tarjeta">
              <Pasos pasos={contenido.pasos} detalle={contenido.detalle} />
            </div>
            {negocio && verificacion && (
              <div className="ac-tarjeta">
                <h3>Datos enviados</h3>
                <div className="ac-kv">
                  <span>Nombre</span>
                  <b>{negocio.nombreComercial}</b>
                </div>
                <div className="ac-kv">
                  <span>{esCentro ? 'Dirección' : 'Zona de trabajo'}</span>
                  <b>{esCentro ? negocio.direccion : negocio.zona?.nombre}</b>
                </div>
                <div className="ac-kv">
                  <span>Enviado</span>
                  <b>{formatearFechaHora(verificacion.creadaEn)}</b>
                </div>
              </div>
            )}
          </div>
          <div className="ac-pie">
            {estado === 'APROBADO' ? (
              <Link className="btn p bloque" href={INICIO_ROL[usuario.rol]}>
                Ir a mi panel
              </Link>
            ) : estado === 'EN_REVISION' ? (
              <Link className="btn p bloque" href={RUTAS.bienvenida}>
                Volver al inicio
              </Link>
            ) : (
              <Link className="btn p bloque" href={rutaCorregir}>
                {estado === 'INFO_PEDIDA' ? 'Completar datos' : 'Corregir datos'}
              </Link>
            )}
            {SOPORTE && (
              <a
                className="btn bloque"
                href={enlaceWhatsApp(
                  SOPORTE,
                  'Hola, tengo una consulta sobre la verificación de mi negocio en RecicloMap.',
                )}
                target="_blank"
                rel="noreferrer"
              >
                <Icono nombre="i-whatsapp" />
                Contactar soporte
              </a>
            )}
            {estado !== 'APROBADO' && (
              <Link className="btn ghost bloque" href={RUTAS.mapa}>
                Explorar el mapa mientras tanto
              </Link>
            )}
            <button
              type="button"
              className="btn ghost bloque"
              onClick={() => void cerrar().then(() => router.replace(RUTAS.bienvenida))}
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </MarcoAcceso>
  );
}

export function EstadoVerificacionNegocio() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']} pasos={['ESPERAR_VERIFICACION', 'LISTO']}>
      <Contenido />
    </Protegida>
  );
}
