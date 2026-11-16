'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { CampoContrasena, CampoIcono, CodigoSeisDigitos } from '@/acceso/campos';
import { AvisoAcceso, BarraAcceso, Girando, MarcoAcceso } from '@/acceso/marco-acceso';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { SoloSinSesion } from '@/sesion/protegida';

const LADO = {
  antetitulo: 'Recuperar acceso',
  titulo: 'Recupera el acceso',
  resaltado: 'a tu cuenta.',
  texto: 'Te enviamos un código de 6 dígitos y creas una contraseña nueva en menos de un minuto.',
  chips: [
    { icono: 'i-lock' as const, texto: 'Proceso seguro' },
    { icono: 'i-clock' as const, texto: 'Menos de un minuto' },
  ],
};

const esValido = (texto: string) =>
  /^\S+@\S+\.\S+$/.test(texto) || /^9\d{8}$/.test(texto.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, ''));

export function RecuperarContrasena() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [identificador, setIdentificador] = useState('');
  const [codigo, setCodigo] = useState('');
  const [token, setToken] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<{ id?: string; codigo?: string; nueva?: string; repetida?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ejecutar = async (accion: () => Promise<void>) => {
    setEnviando(true);
    setError(null);
    try {
      await accion();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'Algo salió mal. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const destino = identificador.includes('@')
    ? identificador.trim()
    : `tu teléfono terminado en ${identificador.replace(/\D/g, '').slice(-3)}`;

  const pedirCodigo = (evento: FormEvent) => {
    evento.preventDefault();
    if (!esValido(identificador.trim())) {
      setErrores({ id: 'Escribe un correo válido o un teléfono de 9 dígitos.' });
      return;
    }
    setErrores({});
    void ejecutar(async () => {
      await pedir('/auth/recuperar', { cuerpo: { identificador: identificador.trim() } });
      setPaso(2);
    });
  };

  const verificar = (evento: FormEvent) => {
    evento.preventDefault();
    setAviso(null);
    if (codigo.length !== 6) {
      setErrores({ codigo: 'Escribe los 6 dígitos del código.' });
      return;
    }
    setErrores({});
    void ejecutar(async () => {
      try {
        const respuesta = await pedir<{ tokenRestablecer: string }>('/auth/recuperar/verificar', {
          cuerpo: { identificador: identificador.trim(), codigo },
        });
        setToken(respuesta.tokenRestablecer);
        setPaso(3);
      } catch (causa) {
        setCodigo('');
        throw causa;
      }
    });
  };

  const reenviar = () =>
    void ejecutar(async () => {
      await pedir('/auth/recuperar', { cuerpo: { identificador: identificador.trim() } });
      setAviso('Si la cuenta existe, te enviamos un código nuevo.');
    });

  const guardar = (evento: FormEvent) => {
    evento.preventDefault();
    const nuevos = {
      nueva: nueva.length < 8 ? 'Debe tener al menos 8 caracteres.' : undefined,
      repetida: nueva !== repetida ? 'Las contraseñas no coinciden.' : undefined,
    };
    setErrores(nuevos);
    if (nuevos.nueva || nuevos.repetida) return;
    void ejecutar(async () => {
      await pedir('/auth/recuperar/restablecer', { cuerpo: { tokenRestablecer: token, contrasena: nueva } });
      setPaso(4);
    });
  };

  return (
    <SoloSinSesion>
      <MarcoAcceso lado={LADO}>
        <BarraAcceso volver={RUTAS.iniciarSesion} etiquetaVolver="Volver al inicio de sesión" />
        {paso === 1 && (
          <form className="ac-pad" onSubmit={pedirCodigo} noValidate>
            <div className="ac-titulo">
              <h1>Recupera tu contraseña</h1>
              <p>Escribe tu correo o teléfono. Te enviaremos un código de 6 dígitos.</p>
            </div>
            {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
            <CampoIcono
              etiqueta="Correo o teléfono"
              icono="i-user"
              autoComplete="username"
              placeholder="marco@correo.com o 951 234 567"
              value={identificador}
              onChange={(evento) => setIdentificador(evento.target.value)}
              error={errores.id}
            />
            <button className="btn p bloque" type="submit" disabled={enviando}>
              {enviando ? <Girando /> : null}
              Enviar código
            </button>
          </form>
        )}
        {paso === 2 && (
          <form className="ac-pad" onSubmit={verificar} noValidate>
            <div className="ac-titulo">
              <h1>Ingresa el código</h1>
              <p>Si hay una cuenta con ese dato, enviamos el código a {destino}. Vence en 10 minutos.</p>
            </div>
            {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
            {aviso && <AvisoAcceso tono="ok">{aviso}</AvisoAcceso>}
            <CodigoSeisDigitos valor={codigo} alCambiar={setCodigo} error={errores.codigo} />
            <button className="btn p bloque" type="submit" disabled={enviando}>
              {enviando ? <Girando /> : null}
              Verificar código
            </button>
            <button type="button" className="btn ghost bloque" onClick={reenviar} disabled={enviando}>
              Reenviar código
            </button>
          </form>
        )}
        {paso === 3 && (
          <form className="ac-pad" onSubmit={guardar} noValidate>
            <div className="ac-titulo">
              <h1>Crea una nueva contraseña</h1>
              <p>Usa 8 o más caracteres con letras y números. Cerraremos tu sesión en los demás dispositivos.</p>
            </div>
            {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
            <CampoContrasena
              etiqueta="Nueva contraseña"
              nueva
              medidor
              valor={nueva}
              alCambiar={setNueva}
              error={errores.nueva}
            />
            <CampoContrasena
              etiqueta="Repite la contraseña"
              nueva
              valor={repetida}
              alCambiar={setRepetida}
              error={errores.repetida}
            />
            <button className="btn p bloque" type="submit" disabled={enviando}>
              {enviando ? <Girando /> : null}
              Guardar contraseña
            </button>
          </form>
        )}
        {paso === 4 && (
          <div className="ac-pad crece" style={{ alignItems: 'flex-start' }}>
            <span className="ac-heroe bien">
              <Icono nombre="i-check" />
            </span>
            <div className="ac-titulo">
              <h1>Contraseña actualizada</h1>
              <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
            </div>
            <Link className="btn p bloque" href={RUTAS.iniciarSesion}>
              Iniciar sesión
            </Link>
          </div>
        )}
      </MarcoAcceso>
    </SoloSinSesion>
  );
}
