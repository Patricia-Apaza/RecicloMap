'use client';

import { esquemaRegistroNegocio } from '@reciclomap/shared';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { CampoContrasena, CampoIcono, mascaraTelefono } from '@/acceso/campos';
import { AvisoAcceso, Girando } from '@/acceso/marco-acceso';
import { FormularioVerificacion } from '@/acceso/verificar-telefono';
import { Casilla } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir, type PasoPendiente, type Sesion } from '@/sesion/api';
import { useSesion } from '@/sesion/sesion';

type Errores = Partial<Record<'telefono' | 'correo' | 'contrasena' | 'aceptaTerminos', string>>;
type Enviado = { telefono: string; enmascarado?: string; reenviarEn: number; enviadoEn: number };

// Paso "Tu cuenta" de 05 y 06: teléfono, correo opcional y contraseña; luego el código por SMS
export function TuCuenta({ tipo, alListo }: { tipo: 'CENTRO' | 'MOVIL'; alListo?: () => void }) {
  const { abrir } = useSesion();
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);

  const crear = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    const validacion = esquemaRegistroNegocio.safeParse({ tipo, telefono, correo, contrasena, aceptaTerminos: acepta });
    if (!validacion.success) {
      const nuevos: Errores = {};
      for (const problema of validacion.error.issues) {
        const campo = String(problema.path[0]) as keyof Errores;
        nuevos[campo] ??= problema.message;
      }
      setErrores(nuevos);
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      const respuesta = await pedir<PasoPendiente>('/auth/registro/negocio', { cuerpo: validacion.data });
      setEnviado({
        telefono: validacion.data.telefono,
        enmascarado: respuesta.telefono,
        reenviarEn: respuesta.reenviarEn ?? 60,
        enviadoEn: Date.now(),
      });
    } catch (causa) {
      if (causa instanceof ErrorApi) {
        setErrores({ telefono: causa.campo('telefono'), correo: causa.campo('correo') });
        setError(causa.message);
      } else setError('No pudimos crear tu cuenta. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <FormularioVerificacion
        telefono={enviado.telefono}
        enmascarado={enviado.enmascarado}
        enviadoEn={enviado.enviadoEn}
        reenviarEn={enviado.reenviarEn}
        alVerificar={(sesion: Sesion) => {
          abrir(sesion);
          alListo?.();
        }}
      />
    );
  }

  return (
    <form className="ac-pad" onSubmit={(evento) => void crear(evento)} noValidate>
      <div className="ac-titulo">
        <h1>Tu cuenta</h1>
        <p>
          Con este teléfono y tu contraseña entrarás a RecicloMap. Te enviaremos un código por SMS para verificarlo.
        </p>
      </div>
      {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
      <CampoIcono
        etiqueta="Teléfono"
        icono="i-phone"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="951 234 567"
        value={mascaraTelefono(telefono)}
        onChange={(evento) => setTelefono(evento.target.value)}
        error={errores.telefono}
      />
      <CampoIcono
        etiqueta="Correo electrónico"
        opcional
        icono="i-mail"
        type="email"
        autoComplete="email"
        placeholder="negocio@correo.com"
        value={correo}
        onChange={(evento) => setCorreo(evento.target.value)}
        error={errores.correo}
      />
      <CampoContrasena nueva medidor valor={contrasena} alCambiar={setContrasena} error={errores.contrasena} />
      <div className={errores.aceptaTerminos ? 'field err' : 'field'}>
        <Casilla
          marcado={acepta}
          alCambiar={setAcepta}
          etiqueta={
            <>
              Acepto los{' '}
              <Link href={RUTAS.terminos} target="_blank" className="ac-enlace" style={{ display: 'inline' }}>
                términos de uso
              </Link>{' '}
              y la{' '}
              <Link
                href={`${RUTAS.terminos}#datos`}
                target="_blank"
                className="ac-enlace"
                style={{ display: 'inline' }}
              >
                política de privacidad
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
      <button className="btn p bloque" type="submit" disabled={enviando}>
        {enviando ? <Girando /> : null}
        {enviando ? 'Creando tu cuenta' : 'Continuar'}
        {!enviando && <Icono nombre="i-arrow-right" />}
      </button>
      <div className="ac-centro">
        <span style={{ color: 'var(--muted)' }}>¿Ya tienes cuenta?</span>
        <Link className="ac-enlace verde" href={RUTAS.iniciarSesion} style={{ minHeight: 44 }}>
          Iniciar sesión
        </Link>
      </div>
    </form>
  );
}
