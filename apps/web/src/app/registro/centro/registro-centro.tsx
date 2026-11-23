'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { CampoIcono } from '@/acceso/campos';
import { AvisoAcceso, Girando, MarcoAcceso, Progreso } from '@/acceso/marco-acceso';
import { useAviso } from '@/diseno/avisos';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { LogoMarca } from '@/diseno/logo';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { PantallaCargando } from '@/sesion/protegida';
import { rutaDelPaso } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';
import { SelectorDias, SelectorFotos, SelectorPagos, SelectorZona, TablaPrecios } from '../_negocio/campos-negocio';
import {
  type DatosNegocio,
  datosIniciales,
  desdeEnviado,
  type ErroresPaso,
  mezclarBorrador,
  type NegocioEnviado,
  paraApi,
  validarCompleto,
  validarPasoCentro,
} from '../_negocio/formulario-negocio';
import { TuCuenta } from '../_negocio/tu-cuenta';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { SelectorPin } from '@/mapa/selector-pin';

const PASOS = ['Tu cuenta', 'Negocio', 'Ubicación', 'Horario', 'Materiales', 'Fotos y pagos'];
const ULTIMO = PASOS.length - 1;
const SE_PUEDE_CORREGIR = new Set(['INFO_PEDIDA', 'RECHAZADO']);

type EstadoNegocio = {
  borrador: { paso: number; datos: unknown } | null;
  negocio: NegocioEnviado | null;
  verificacion: { estado: string } | null;
};

function Lateral({ paso }: { paso: number }) {
  return (
    <aside className="ac-lateral">
      <div className="row g8" style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)', fontFamily: 'var(--head)' }}>
        <LogoMarca tamano={36} />
        RecicloMap
      </div>
      <div>
        <h3>Registra tu centro</h3>
        <p className="mini" style={{ fontSize: 13 }}>
          Aparecerás en el mapa cuando verifiquemos tus datos.
        </p>
      </div>
      <ol className="ac-pasos" aria-label="Pasos del registro" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {PASOS.map((titulo, indice) => {
          const estado = indice < paso ? 'hecho' : indice === paso ? 'ahora' : '';
          return (
            <li key={titulo} className={clases('ac-vpaso', estado)} aria-current={indice === paso ? 'step' : undefined}>
              <span className="dot">{indice < paso ? <Icono nombre="i-check" tamano="sm" /> : indice + 1}</span>
              <p>{titulo}</p>
            </li>
          );
        })}
      </ol>
      <p className="nota-pie">
        Los precios los mantienes tú. Los administradores pueden revisarlos, pero no cambiarlos.
      </p>
    </aside>
  );
}

function Asistente({ corrigiendo, inicial }: { corrigiendo: boolean; inicial: { paso: number; datos: DatosNegocio } }) {
  const router = useRouter();
  const aviso = useAviso();
  const { configuracion } = useConfiguracionPublica();
  // Mientras carga la configuración se asume que el pin es obligatorio; en desarrollo y pruebas puede no serlo
  const pinObligatorio = configuracion ? configuracion.mapa.pinObligatorio : true;
  const { actualizar } = useSesion();
  const [paso, setPaso] = useState(inicial.paso);
  const [datos, setDatos] = useState<DatosNegocio>(inicial.datos);
  const [errores, setErrores] = useState<ErroresPaso>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [zona, setZona] = useState<{ nombre: string; lat: number; lng: number } | null>(null);

  const cambiar = (cambio: Partial<DatosNegocio>) => setDatos((actuales) => ({ ...actuales, ...cambio }));

  const guardarBorrador = async (pasoGuardado: number, mostrar: boolean) => {
    try {
      await pedir('/mi-negocio/registro', { metodo: 'PUT', cuerpo: { paso: pasoGuardado, datos } });
      if (mostrar) aviso('Borrador guardado');
    } catch (causa) {
      if (mostrar) aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el borrador.');
    }
  };

  const mostrarPaso = (nuevo: number) => {
    setPaso(nuevo);
    setError(null);
    document.querySelector('.ac-principal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const encontrados = validarPasoCentro(paso, datos, pinObligatorio);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) {
      setError(encontrados.precios ?? null);
      return;
    }
    if (paso < ULTIMO) {
      void guardarBorrador(paso + 1, false);
      mostrarPaso(paso + 1);
      return;
    }
    const validacion = validarCompleto('CENTRO', datos);
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? 'Revisa los datos del registro.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await pedir(corrigiendo ? '/mi-negocio/verificacion/reenviar' : '/mi-negocio/registro/enviar', {
        cuerpo: paraApi('CENTRO', datos),
      });
      await actualizar();
      router.replace(RUTAS.verificacion);
    } catch (causa) {
      const campo = causa instanceof ErrorApi ? causa.campos[0]?.mensaje : undefined;
      setError(
        causa instanceof ErrorApi ? (campo ?? causa.message) : 'No pudimos enviar tu registro. Intenta de nuevo.',
      );
      setEnviando(false);
    }
  };

  return (
    <form className="ac-principal" onSubmit={(evento) => void enviar(evento)} noValidate>
      <div className="row sp">
        <span className="pill blue">
          Paso {paso + 1} de {PASOS.length}
        </span>
        <button type="button" className="btn ghost sm" onClick={() => void guardarBorrador(paso, true)}>
          Guardar borrador
        </button>
      </div>
      <Progreso
        porcentaje={Math.round(((paso + 1) / PASOS.length) * 100)}
        etiqueta={`Paso ${paso + 1} de ${PASOS.length}`}
        suelto
      />
      {corrigiendo && paso === 1 && (
        <AvisoAcceso tono="info">Corrige lo que te pidió el administrador y vuelve a enviar tu registro.</AvisoAcceso>
      )}

      {paso === 1 && (
        <section className="ac-seccion">
          <div>
            <h1>Datos del negocio</h1>
            <p>Así te verán los recicladores.</p>
          </div>
          <CampoIcono
            etiqueta="Nombre del centro"
            icono="i-store"
            placeholder="Ej. EcoAcopio Juliaca"
            value={datos.nombreComercial}
            onChange={(evento) => cambiar({ nombreComercial: evento.target.value })}
            error={errores.nombreComercial}
          />
          <div className="field">
            <label htmlFor="descripcion">
              Descripción breve <span className="opt">(opcional)</span>
            </label>
            <div className="inp ta">
              <textarea
                id="descripcion"
                rows={3}
                maxLength={160}
                placeholder="Qué compras, desde qué cantidad y qué te hace confiable."
                value={datos.descripcion}
                onChange={(evento) => cambiar({ descripcion: evento.target.value })}
              />
            </div>
            <span className="hint">{datos.descripcion.length} de 160 caracteres</span>
          </div>
          <CampoIcono
            etiqueta="Dirección"
            icono="i-pin"
            placeholder="Ej. Jr. Moquegua 450, Juliaca"
            value={datos.direccion}
            onChange={(evento) => cambiar({ direccion: evento.target.value })}
            error={errores.direccion}
          />
          <div className="ac-dos">
            <CampoIcono
              etiqueta="Teléfono"
              icono="i-phone"
              inputMode="numeric"
              maxLength={9}
              placeholder="951234567"
              value={datos.telefonoNegocio}
              onChange={(evento) => cambiar({ telefonoNegocio: evento.target.value.replace(/\D/g, '') })}
              error={errores.telefonoNegocio}
            />
            <CampoIcono
              etiqueta="WhatsApp"
              icono="i-whatsapp"
              inputMode="numeric"
              maxLength={9}
              placeholder="951234567"
              value={datos.whatsapp}
              onChange={(evento) => cambiar({ whatsapp: evento.target.value.replace(/\D/g, '') })}
              error={errores.whatsapp}
            />
          </div>
        </section>
      )}

      {paso === 2 && (
        <section className="ac-seccion">
          <div>
            <h1>Ubicación en el mapa</h1>
            <p>
              Elige tu zona y coloca el pin en la puerta de tu local. Con él calculamos la distancia a cada reciclador.
            </p>
          </div>
          <SelectorZona
            etiqueta="Zona del local"
            zonaId={datos.zonaId}
            alCambiar={(elegida) => {
              cambiar({ zonaId: elegida.id });
              setZona(elegida);
            }}
            error={errores.zonaId}
          />
          <div className={errores.ubicacion ? 'field err' : 'field'}>
            <span className="lbl">Pin de tu local</span>
            <SelectorPin
              valor={datos.ubicacion}
              centro={zona ? { lat: zona.lat, lng: zona.lng } : null}
              alCambiar={(ubicacion) => cambiar({ ubicacion })}
            />
            {errores.ubicacion && (
              <span className="msg" role="alert">
                <Icono nombre="i-alert" tamano="sm" />
                {errores.ubicacion}
              </span>
            )}
          </div>
          <AvisoAcceso tono="info">
            {zona ? `Zona aproximada: ${zona.nombre}. ` : ''}La dirección exacta solo se muestra en el detalle de tu
            centro.
          </AvisoAcceso>
        </section>
      )}

      {paso === 3 && (
        <section className="ac-seccion">
          <div>
            <h1>Horario de atención</h1>
            <p>Indica los días y las horas en que recibes material.</p>
          </div>
          <div className={errores.dias ? 'field err' : 'field'}>
            <span className="lbl">Días de atención</span>
            <SelectorDias dias={datos.dias} alCambiar={(dias) => cambiar({ dias })} />
            {errores.dias && (
              <span className="msg" role="alert">
                <Icono nombre="i-alert" tamano="sm" />
                {errores.dias}
              </span>
            )}
          </div>
          <div className="ac-dos">
            <CampoIcono
              etiqueta="Abre"
              icono="i-clock"
              type="time"
              value={datos.abre}
              onChange={(evento) => cambiar({ abre: evento.target.value })}
            />
            <CampoIcono
              etiqueta="Cierra"
              icono="i-clock"
              type="time"
              value={datos.cierra}
              onChange={(evento) => cambiar({ cierra: evento.target.value })}
              error={errores.cierra}
            />
          </div>
        </section>
      )}

      {paso === 4 && (
        <section className="ac-seccion">
          <div>
            <h1>Materiales, precios y demanda</h1>
            <p>El precio por kg es obligatorio y se muestra como rango. Marca los materiales que compras.</p>
          </div>
          {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
          <TablaPrecios precios={datos.precios} alCambiar={(precios) => cambiar({ precios })} />
          <span className="hint">La demanda indica cuánto necesitas del material y es independiente del precio.</span>
        </section>
      )}

      {paso === 5 && (
        <section className="ac-seccion">
          <div>
            <h1>Fotos y métodos de pago</h1>
            <p>Muestra tu local y cómo pagas a los recicladores.</p>
          </div>
          <SelectorFotos fotos={datos.fotos} alCambiar={(fotos) => cambiar({ fotos })} />
          <div className={errores.pagos ? 'field err' : 'field'}>
            <span className="lbl">Métodos de pago</span>
            <SelectorPagos pagos={datos.pagos} alCambiar={(pagos) => cambiar({ pagos })} />
            {errores.pagos && (
              <span className="msg" role="alert">
                <Icono nombre="i-alert" tamano="sm" />
                {errores.pagos}
              </span>
            )}
          </div>
          <AvisoAcceso tono="warn">RecicloMap no procesa pagos. Pagas directamente al reciclador.</AvisoAcceso>
          {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
        </section>
      )}

      <div className="ac-acciones">
        <button type="button" className="btn" disabled={paso <= 1 || enviando} onClick={() => mostrarPaso(paso - 1)}>
          <Icono nombre="i-arrow-left" />
          Atrás
        </button>
        <button type="submit" className="btn p" disabled={enviando}>
          {enviando ? <Girando /> : null}
          {paso === ULTIMO ? (enviando ? 'Enviando' : 'Enviar para verificación') : 'Continuar'}
          {!enviando && <Icono nombre={paso === ULTIMO ? 'i-check' : 'i-arrow-right'} />}
        </button>
      </div>
    </form>
  );
}

export function RegistroCentro() {
  const router = useRouter();
  const corregir = useSearchParams().get('corregir') === '1';
  const { cargando, usuario } = useSesion();
  const [inicial, setInicial] = useState<{ paso: number; datos: DatosNegocio; corrigiendo: boolean } | null>(null);

  const permitido =
    usuario &&
    usuario.rol === 'CENTRO' &&
    (usuario.siguientePaso === 'COMPLETAR_NEGOCIO' || (corregir && usuario.siguientePaso === 'ESPERAR_VERIFICACION'));

  useEffect(() => {
    if (cargando || !usuario) return;
    if (!permitido) {
      router.replace(rutaDelPaso(usuario));
      return;
    }
    let vigente = true;
    pedir<EstadoNegocio>('/mi-negocio')
      .then((estado) => {
        if (!vigente) return;
        if (estado.negocio) {
          if (!estado.verificacion || !SE_PUEDE_CORREGIR.has(estado.verificacion.estado)) {
            router.replace(RUTAS.verificacion);
            return;
          }
          const desde = estado.borrador
            ? mezclarBorrador('CENTRO', estado.borrador.datos)
            : desdeEnviado(estado.negocio);
          setInicial({ paso: 1, datos: desde, corrigiendo: true });
          return;
        }
        const borrador = estado.borrador;
        setInicial({
          paso: borrador ? Math.min(Math.max(borrador.paso, 1), ULTIMO) : 1,
          datos: borrador ? mezclarBorrador('CENTRO', borrador.datos) : datosIniciales('CENTRO'),
          corrigiendo: false,
        });
      })
      .catch(() => vigente && setInicial({ paso: 1, datos: datosIniciales('CENTRO'), corrigiendo: false }));
    return () => {
      vigente = false;
    };
  }, [cargando, usuario, permitido, router]);

  const paso = usuario ? (inicial?.paso ?? 1) : 0;
  return (
    <MarcoAcceso ancho>
      <div className="ac-armazon">
        <Lateral paso={paso} />
        {cargando || (usuario && !inicial) ? (
          <div className="ac-principal">
            <PantallaCargando />
          </div>
        ) : !usuario ? (
          <div className="ac-principal">
            <div className="row sp">
              <span className="pill blue">Paso 1 de {PASOS.length}</span>
            </div>
            <Progreso porcentaje={Math.round(100 / PASOS.length)} etiqueta={`Paso 1 de ${PASOS.length}`} suelto />
            <TuCuenta tipo="CENTRO" />
          </div>
        ) : (
          inicial && <Asistente corrigiendo={inicial.corrigiendo} inicial={inicial} />
        )}
      </div>
    </MarcoAcceso>
  );
}
