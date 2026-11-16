'use client';

import { esquemaRegistroReciclador } from '@reciclomap/shared';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { BotonGoogle } from '@/acceso/boton-google';
import { CampoContrasena, CampoIcono, mascaraTelefono } from '@/acceso/campos';
import { useContinuar } from '@/acceso/continuar';
import { guardarFotoPendiente } from '@/acceso/foto-pendiente';
import { AvisoAcceso, BarraAcceso, Girando, MarcoAcceso, Progreso } from '@/acceso/marco-acceso';
import { SelectorAvatar } from '@/acceso/selector-avatar';
import { Casilla } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir, type PasoPendiente } from '@/sesion/api';
import { SoloSinSesion } from '@/sesion/protegida';

const LADO = {
  antetitulo: 'Cuenta de reciclador',
  titulo: 'Tu material tiene valor.',
  resaltado: 'Cobra mejor.',
  texto: 'Compara precios por kg cerca de ti y publica lo que tienes. Tu ubicación exacta nunca es pública.',
  chips: [
    { icono: 'i-user' as const, texto: 'Gratis para recicladores' },
    { icono: 'i-lock' as const, texto: 'Tu ubicación es privada' },
  ],
};

type Errores = Partial<Record<'nombre' | 'telefono' | 'correo' | 'contrasena' | 'aceptaTerminos', string>>;

export function RegistroReciclador() {
  const continuar = useContinuar();
  const [foto, setFoto] = useState<File | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    const datos = { nombre, telefono, correo, contrasena, aceptaTerminos: acepta };
    const validacion = esquemaRegistroReciclador.safeParse(datos);
    if (!validacion.success) {
      const nuevos: Errores = {};
      for (const problema of validacion.error.issues) {
        const campo = String(problema.path[0]) as keyof Errores;
        nuevos[campo] ??= problema.message;
      }
      setErrores(nuevos);
      document.querySelector('.field.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      const respuesta = await pedir<PasoPendiente>('/auth/registro/reciclador', { cuerpo: validacion.data });
      guardarFotoPendiente(foto);
      continuar(respuesta, { telefono: validacion.data.telefono });
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.campos.length > 0) {
        setErrores({
          telefono: causa.campo('telefono'),
          correo: causa.campo('correo'),
          nombre: causa.campo('nombre'),
          contrasena: causa.campo('contrasena'),
        });
      }
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos crear tu cuenta. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <SoloSinSesion>
      <MarcoAcceso lado={LADO}>
        <BarraAcceso volver={RUTAS.bienvenida} derecha={<span className="ac-paso-texto">Paso 1 de 2</span>} />
        <Progreso porcentaje={50} etiqueta="Paso 1 de 2" />
        <form className="ac-pad" onSubmit={(evento) => void enviar(evento)} noValidate>
          <div className="ac-titulo">
            <h1>Crea tu cuenta</h1>
            <p>Solo toma un minuto. Tu ubicación exacta nunca será pública.</p>
          </div>
          {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
          <div className="row g16">
            <SelectorAvatar archivo={foto} alElegir={setFoto} etiqueta="Subir foto de perfil" />
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>
                Foto de perfil <span style={{ fontWeight: 500, color: 'var(--muted)' }}>(opcional)</span>
              </p>
              <p className="mini" style={{ margin: 0, fontSize: 13 }}>
                Ayuda a que centros y compradores confíen en ti.
              </p>
            </div>
          </div>
          <CampoIcono
            etiqueta="Nombre completo"
            icono="i-user"
            autoComplete="name"
            placeholder="Ej. Marco Quispe Condori"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            error={errores.nombre}
          />
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
          <CampoIcono
            etiqueta="Correo electrónico"
            opcional
            icono="i-mail"
            type="email"
            autoComplete="email"
            placeholder="marco@correo.com"
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
          <BotonGoogle texto="signup_with" />
          <div className="ac-centro">
            <span style={{ color: 'var(--muted)' }}>¿Ya tienes cuenta?</span>
            <Link className="ac-enlace verde" href={RUTAS.iniciarSesion} style={{ minHeight: 44 }}>
              Iniciar sesión
            </Link>
          </div>
        </form>
      </MarcoAcceso>
    </SoloSinSesion>
  );
}
