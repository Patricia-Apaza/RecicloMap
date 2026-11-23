'use client';

import { CasillaMayorEdad } from '@/acceso/casilla-mayor-edad';

import { esquemaCompletarGoogle } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { type FormEvent, useState } from 'react';
import { CampoIcono, mascaraTelefono } from '@/acceso/campos';
import { type CuentaGoogle, leerCuentaGoogle, useContinuar } from '@/acceso/continuar';
import { AvisoAcceso, BarraAcceso, Girando, MarcoAcceso } from '@/acceso/marco-acceso';
import { FormularioVerificacion } from '@/acceso/verificar-telefono';
import { clases } from '@/diseno/clases';
import { Casilla } from '@/diseno/formulario';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir, type PasoPendiente } from '@/sesion/api';
import { SoloSinSesion } from '@/sesion/protegida';

const LADO = {
  antetitulo: 'Cuenta con Google',
  titulo: 'Un paso más',
  resaltado: 'y listo.',
  texto: 'Cuéntanos cómo vas a usar RecicloMap y verifica tu teléfono. Así otros pueden confiar en ti.',
  chips: [
    { icono: 'i-shield' as const, texto: 'Teléfono verificado' },
    { icono: 'i-lock' as const, texto: 'Tu ubicación es privada' },
  ],
};

type Rol = 'RECICLADOR' | 'CENTRO' | 'COMPRADOR_MOVIL';
const ROLES: Array<{ valor: Rol; titulo: string; texto: string; icono: NombreIcono }> = [
  {
    valor: 'RECICLADOR',
    titulo: 'Soy reciclador',
    texto: 'Compara precios y publica lo que tienes.',
    icono: 'i-recycle',
  },
  { valor: 'CENTRO', titulo: 'Soy centro de acopio', texto: 'Muestra tus precios y tu demanda.', icono: 'i-building' },
  {
    valor: 'COMPRADOR_MOVIL',
    titulo: 'Soy comprador móvil',
    texto: 'Ofrece por el material de tu zona.',
    icono: 'i-truck',
  },
];

export function CompletarCuenta() {
  const continuar = useContinuar();
  const [cuenta] = useState<CuentaGoogle | null>(() => (typeof window === 'undefined' ? null : leerCuentaGoogle()));
  const [rol, setRol] = useState<Rol | null>(null);
  const [telefono, setTelefono] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [mayor, setMayor] = useState(false);
  const [errores, setErrores] = useState<{
    rol?: string;
    telefono?: string;
    aceptaTerminos?: string;
    mayorDeEdad?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{
    telefono: string;
    enmascarado?: string;
    enviadoEn: number;
    reenviarEn: number;
  } | null>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!cuenta) return;
    setError(null);
    const validacion = esquemaCompletarGoogle.safeParse({
      tokenTemporal: cuenta.tokenTemporal,
      rol,
      telefono,
      aceptaTerminos: acepta,
      mayorDeEdad: mayor,
    });
    if (!validacion.success) {
      const nuevos: typeof errores = {};
      for (const problema of validacion.error.issues) {
        const campo = String(problema.path[0]) as keyof typeof errores;
        nuevos[campo] ??= problema.message;
      }
      setErrores(nuevos);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      const respuesta = await pedir<PasoPendiente>('/auth/google/completar', { cuerpo: validacion.data });
      setEnviado({
        telefono: validacion.data.telefono,
        enmascarado: respuesta.telefono,
        enviadoEn: Date.now(),
        reenviarEn: respuesta.reenviarEn ?? 60,
      });
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos completar tu cuenta.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SoloSinSesion>
      <MarcoAcceso lado={LADO}>
        <BarraAcceso volver={RUTAS.iniciarSesion} etiquetaVolver="Volver al inicio de sesión" />
        {!cuenta ? (
          <div className="ac-pad">
            <div className="ac-titulo">
              <h1>Este paso venció</h1>
              <p>Vuelve a entrar con Google para completar tu cuenta.</p>
            </div>
            <Link className="btn p bloque" href={RUTAS.iniciarSesion}>
              Iniciar sesión
            </Link>
          </div>
        ) : enviado ? (
          <FormularioVerificacion
            telefono={enviado.telefono}
            enmascarado={enviado.enmascarado}
            enviadoEn={enviado.enviadoEn}
            reenviarEn={enviado.reenviarEn}
            alVerificar={(sesion) => continuar(sesion)}
          />
        ) : (
          <form className="ac-pad" onSubmit={(evento) => void enviar(evento)} noValidate>
            <div className="ac-titulo">
              <h1>Completa tu cuenta</h1>
              <p>
                {cuenta.nombre ? `Hola, ${cuenta.nombre.split(' ')[0]}. ` : ''}
                Elige cómo vas a usar RecicloMap y verifica tu teléfono.
              </p>
            </div>
            {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
            <div className={errores.rol ? 'field err' : 'field'}>
              <span className="lbl">¿Cómo vas a usar RecicloMap?</span>
              <div className="stack" role="radiogroup" aria-label="Rol" style={{ gap: 10 }}>
                {ROLES.map((opcion) => (
                  <label key={opcion.valor} className={clases('ac-mat', rol === opcion.valor && 'on')}>
                    <input
                      type="radio"
                      name="rol"
                      checked={rol === opcion.valor}
                      onChange={() => setRol(opcion.valor)}
                      aria-label={opcion.titulo}
                    />
                    <span className="em">
                      <Icono nombre={opcion.icono} tamano="lg" />
                    </span>
                    <div>
                      <h3>{opcion.titulo}</h3>
                      <p>{opcion.texto}</p>
                    </div>
                    <span className="ck">
                      <Icono nombre="i-check" tamano="sm" />
                    </span>
                  </label>
                ))}
              </div>
              {errores.rol && (
                <span className="msg" role="alert">
                  <Icono nombre="i-alert" tamano="sm" />
                  {errores.rol}
                </span>
              )}
            </div>
            <CampoIcono
              etiqueta="Teléfono (WhatsApp)"
              icono="i-phone"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="951 234 567"
              value={mascaraTelefono(telefono)}
              onChange={(evento) => setTelefono(evento.target.value)}
              error={errores.telefono}
              ayuda="Te enviaremos un código por SMS para verificarlo."
            />
            <div className={errores.aceptaTerminos ? 'field err' : 'field'}>
              <Casilla
                marcado={acepta}
                alCambiar={setAcepta}
                etiqueta={
                  <>
                    Acepto los{' '}
                    <Link href={RUTAS.terminos} target="_blank" className="ac-enlace" style={{ display: 'inline' }}>
                      términos de uso y la política de privacidad
                    </Link>
                    .
                  </>
                }
              />
              {errores.aceptaTerminos && (
                <span className="msg" role="alert">
                  <Icono nombre="i-alert" tamano="sm" />
                  Debes aceptar para continuar.
                </span>
              )}
            </div>
            <CasillaMayorEdad marcado={mayor} alCambiar={setMayor} error={errores.mayorDeEdad} />
            <button className="btn p bloque" type="submit" disabled={enviando}>
              {enviando ? <Girando /> : null}
              Continuar
            </button>
          </form>
        )}
      </MarcoAcceso>
    </SoloSinSesion>
  );
}
