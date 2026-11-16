'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { BotonGoogle } from '@/acceso/boton-google';
import { CampoContrasena, CampoIcono, CodigoSeisDigitos } from '@/acceso/campos';
import { useContinuar } from '@/acceso/continuar';
import { AvisoAcceso, BarraAcceso, Girando, MarcoAcceso } from '@/acceso/marco-acceso';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir, type PasoPendiente, type Sesion } from '@/sesion/api';
import { SoloSinSesion } from '@/sesion/protegida';

const LADO = {
  antetitulo: 'Bienvenido de vuelta',
  titulo: 'Vuelve al mapa',
  resaltado: 'de precios.',
  texto: 'Entra y mira quién compra tu material hoy, cuánto paga y dónde.',
  chips: [
    { icono: 'i-map' as const, texto: 'Mapa con precios por kg' },
    { icono: 'i-tag' as const, texto: 'Semáforo de precio y demanda' },
  ],
};

type PasoAdmin = { tokenTemporal: string; telefono?: string };

export function InicioSesion() {
  const continuar = useContinuar();
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<{ id?: string; pw?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [admin, setAdmin] = useState<PasoAdmin | null>(null);
  const [codigo, setCodigo] = useState('');

  const ingresar = async (evento: FormEvent) => {
    evento.preventDefault();
    const faltan = {
      id: identificador.trim() ? undefined : 'Escribe tu correo o teléfono.',
      pw: contrasena ? undefined : 'Escribe tu contraseña.',
    };
    setErrores(faltan);
    setError(null);
    if (faltan.id || faltan.pw) return;
    setEnviando(true);
    try {
      const respuesta = await pedir<Sesion | PasoPendiente>('/auth/login', {
        cuerpo: { identificador: identificador.trim(), contrasena },
      });
      if ('siguientePaso' in respuesta && respuesta.siguientePaso === 'CODIGO_ADMIN' && respuesta.tokenTemporal) {
        setAdmin({ tokenTemporal: respuesta.tokenTemporal, telefono: respuesta.telefono });
        setEnviando(false);
        return;
      }
      const telefono = identificador.includes('@') ? undefined : identificador.replace(/\D/g, '').slice(-9);
      continuar(respuesta, { telefono });
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos iniciar sesión. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  const verificarAdmin = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!admin) return;
    if (codigo.length !== 6) {
      setError('Escribe los 6 dígitos del código.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      continuar(
        await pedir<Sesion>('/auth/admin/verificar', { cuerpo: { tokenTemporal: admin.tokenTemporal, codigo } }),
      );
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos verificar el código.');
      setEnviando(false);
    }
  };

  return (
    <SoloSinSesion>
      <MarcoAcceso lado={LADO}>
        <BarraAcceso volver={RUTAS.bienvenida} />
        {admin ? (
          <form className="ac-pad" onSubmit={(evento) => void verificarAdmin(evento)} noValidate>
            <div className="ac-titulo">
              <h1>Código de administración</h1>
              <p>Lo enviamos por SMS al teléfono {admin.telefono ?? 'de tu cuenta'}. Vence en 10 minutos.</p>
            </div>
            {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
            <CodigoSeisDigitos valor={codigo} alCambiar={setCodigo} />
            <button className="btn p bloque" type="submit" disabled={enviando}>
              {enviando ? <Girando /> : null}
              {enviando ? 'Verificando' : 'Entrar'}
            </button>
            <button
              type="button"
              className="btn ghost bloque"
              onClick={() => {
                setAdmin(null);
                setCodigo('');
                setError(null);
              }}
            >
              Volver
            </button>
          </form>
        ) : (
          <form className="ac-pad" onSubmit={(evento) => void ingresar(evento)} noValidate>
            <div className="ac-titulo">
              <h1>Inicia sesión</h1>
              <p>Entra con tu correo o tu número de teléfono.</p>
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
            <CampoContrasena valor={contrasena} alCambiar={setContrasena} error={errores.pw} />
            <Link href={RUTAS.recuperar} className="ac-enlace" style={{ alignSelf: 'flex-end' }}>
              Olvidé mi contraseña
            </Link>
            <button className="btn p bloque" type="submit" disabled={enviando}>
              {enviando ? <Girando /> : null}
              {enviando ? 'Ingresando' : 'Ingresar'}
            </button>
            <BotonGoogle />
            <div className="ac-centro">
              <span style={{ color: 'var(--muted)' }}>¿No tienes cuenta?</span>
              <Link className="ac-enlace verde" href={`${RUTAS.bienvenida}#roles`} style={{ minHeight: 44 }}>
                Crear cuenta
                <Icono nombre="i-arrow-right" tamano="sm" />
              </Link>
            </div>
          </form>
        )}
      </MarcoAcceso>
    </SoloSinSesion>
  );
}
