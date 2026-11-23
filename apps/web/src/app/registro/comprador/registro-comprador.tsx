'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { CampoIcono } from '@/acceso/campos';
import { subirFoto, useFotoProtegida } from '@/acceso/fotos';
import { AvisoAcceso, BarraAcceso, Girando, MarcoAcceso, Progreso } from '@/acceso/marco-acceso';
import { SelectorAvatar } from '@/acceso/selector-avatar';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { PantallaCargando } from '@/sesion/protegida';
import { rutaDelPaso } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';
import { SelectorVehiculo, SelectorZona, TablaPrecios } from '../_negocio/campos-negocio';
import {
  type DatosNegocio,
  datosIniciales,
  desdeEnviado,
  type ErroresPaso,
  mezclarBorrador,
  type NegocioEnviado,
  paraApi,
  validarCompleto,
  validarMovil,
} from '../_negocio/formulario-negocio';
import { TuCuenta } from '../_negocio/tu-cuenta';

const LADO = {
  antetitulo: 'Cuenta de comprador móvil',
  titulo: 'Llega donde',
  resaltado: 'está el material.',
  texto:
    'Ofrece por el material de tu zona de trabajo. Apareces en el mapa con una ubicación aproximada, no en tiempo real.',
  chips: [
    { icono: 'i-truck' as const, texto: 'Comprador móvil' },
    { icono: 'i-shield' as const, texto: 'Perfil verificado' },
  ],
};
const SE_PUEDE_CORREGIR = new Set(['INFO_PEDIDA', 'RECHAZADO']);

type EstadoNegocio = {
  borrador: { paso: number; datos: unknown } | null;
  negocio: NegocioEnviado | null;
  verificacion: { estado: string } | null;
};

function Formulario({ corrigiendo, inicial }: { corrigiendo: boolean; inicial: DatosNegocio }) {
  const router = useRouter();
  const { actualizar } = useSesion();
  const [datos, setDatos] = useState<DatosNegocio>(inicial);
  const [foto, setFoto] = useState<File | null>(null);
  const previa = useFotoProtegida(foto ? null : datos.fotos[0]);
  const [errores, setErrores] = useState<ErroresPaso>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (cambio: Partial<DatosNegocio>) => setDatos((actuales) => ({ ...actuales, ...cambio }));

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    const encontrados = validarMovil(datos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) {
      document.querySelector('.field.err, .ac-aviso.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setEnviando(true);
    try {
      let fotos = datos.fotos;
      if (foto) fotos = [(await subirFoto(foto, 'NEGOCIO')).id];
      const completos = { ...datos, fotos };
      const validacion = validarCompleto('MOVIL', completos);
      if (!validacion.success)
        throw new ErrorApi('ENTRADA_NO_VALIDA', validacion.error.issues[0]?.message ?? 'Revisa tus datos.', 400);
      await pedir(corrigiendo ? '/mi-negocio/verificacion/reenviar' : '/mi-negocio/registro/enviar', {
        cuerpo: paraApi('MOVIL', completos),
      });
      await actualizar();
      router.replace(RUTAS.verificacion);
    } catch (causa) {
      const campo = causa instanceof ErrorApi ? causa.campos[0]?.mensaje : undefined;
      setError(causa instanceof ErrorApi ? (campo ?? causa.message) : 'No pudimos enviar tu perfil. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <form className="ac-pad" onSubmit={(evento) => void enviar(evento)} noValidate>
      <div className="ac-titulo">
        <h1>Crea tu perfil de comprador</h1>
        <p>Aparecerás en el mapa con una ubicación aproximada, no en tiempo real.</p>
      </div>
      {corrigiendo && (
        <AvisoAcceso tono="info">Corrige lo que te pidió el administrador y vuelve a enviar tu perfil.</AvisoAcceso>
      )}
      {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
      <div className="row g16">
        <SelectorAvatar archivo={foto} alElegir={setFoto} etiqueta="Subir foto" previa={previa} />
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>Foto</p>
          <p className="mini" style={{ margin: 0, fontSize: 13 }}>
            Tu cara o tu vehículo, para que te reconozcan.
          </p>
        </div>
      </div>
      <CampoIcono
        etiqueta="Nombre o negocio"
        icono="i-user"
        placeholder="Ej. Rubén M. · Compras Rubén"
        value={datos.nombreComercial}
        onChange={(evento) => cambiar({ nombreComercial: evento.target.value })}
        error={errores.nombreComercial}
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
      <div className="field">
        <span className="lbl">Vehículo</span>
        <SelectorVehiculo vehiculo={datos.vehiculo} alCambiar={(vehiculo) => cambiar({ vehiculo })} />
      </div>
      <div className={errores.precios ? 'field err' : 'field'}>
        <span className="lbl">Materiales y precios por kg</span>
        <TablaPrecios movil precios={datos.precios} alCambiar={(precios) => cambiar({ precios })} />
        {errores.precios && (
          <span className="msg" role="alert">
            <Icono nombre="i-alert" tamano="sm" />
            {errores.precios}
          </span>
        )}
      </div>
      <SelectorZona
        etiqueta="Zona de trabajo"
        zonaId={datos.zonaId}
        alCambiar={(zona) => cambiar({ zonaId: zona.id })}
        error={errores.zonaId}
      />
      <div className="ac-dos">
        <CampoIcono
          etiqueta="Desde"
          icono="i-clock"
          type="time"
          value={datos.abre}
          onChange={(evento) => cambiar({ abre: evento.target.value })}
        />
        <CampoIcono
          etiqueta="Hasta"
          icono="i-clock"
          type="time"
          value={datos.cierra}
          onChange={(evento) => cambiar({ cierra: evento.target.value })}
          error={errores.cierra}
        />
      </div>
      <AvisoAcceso tono="info">Un administrador verificará tu perfil antes de mostrarte en el mapa.</AvisoAcceso>
      <button className="btn p bloque" type="submit" disabled={enviando}>
        {enviando ? <Girando /> : null}
        {enviando ? 'Enviando' : 'Enviar para verificación'}
      </button>
    </form>
  );
}

export function RegistroComprador() {
  const router = useRouter();
  const corregir = useSearchParams().get('corregir') === '1';
  const { cargando, usuario } = useSesion();
  const [inicial, setInicial] = useState<{ datos: DatosNegocio; corrigiendo: boolean } | null>(null);
  const permitido =
    usuario &&
    usuario.rol === 'COMPRADOR_MOVIL' &&
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
          setInicial({ datos: desdeEnviado(estado.negocio), corrigiendo: true });
          return;
        }
        setInicial({
          datos: estado.borrador ? mezclarBorrador('MOVIL', estado.borrador.datos) : datosIniciales('MOVIL'),
          corrigiendo: false,
        });
      })
      .catch(() => vigente && setInicial({ datos: datosIniciales('MOVIL'), corrigiendo: false }));
    return () => {
      vigente = false;
    };
  }, [cargando, usuario, permitido, router]);

  return (
    <MarcoAcceso lado={LADO}>
      <BarraAcceso
        volver={usuario ? undefined : RUTAS.bienvenida}
        derecha={<span className="pill blue">Comprador móvil · Paso {usuario ? 2 : 1} de 2</span>}
      />
      <Progreso porcentaje={usuario ? 100 : 50} etiqueta={`Paso ${usuario ? 2 : 1} de 2`} />
      {cargando || (usuario && !inicial) ? (
        <PantallaCargando />
      ) : !usuario ? (
        <TuCuenta tipo="MOVIL" />
      ) : (
        inicial && <Formulario corrigiendo={inicial.corrigiendo} inicial={inicial.datos} />
      )}
    </MarcoAcceso>
  );
}
