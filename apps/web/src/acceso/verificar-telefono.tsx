'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { ErrorApi, pedir, type PasoPendiente, type Sesion } from '@/sesion/api';
import { CampoIcono, CodigoSeisDigitos, mascaraTelefono } from './campos';
import { AvisoAcceso, Girando } from './marco-acceso';

function useCuentaRegresiva(desde: number, segundos: number): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);
  return Math.max(0, Math.ceil((desde + segundos * 1000 - ahora) / 1000));
}

// Paso "Verifica tu teléfono": código de 6 dígitos por SMS, reenvío cada 60 segundos
export function FormularioVerificacion({
  telefono: telefonoInicial,
  enmascarado,
  enviadoEn: enviadoInicial,
  reenviarEn: esperaInicial = 60,
  codigoDePrueba: codigoInicial,
  alVerificar,
  titulo = 'Verifica tu teléfono',
}: {
  telefono?: string;
  enmascarado?: string;
  enviadoEn?: number;
  reenviarEn?: number;
  codigoDePrueba?: string;
  alVerificar: (sesion: Sesion) => void;
  titulo?: string;
}) {
  const [telefono, setTelefono] = useState(telefonoInicial ?? '');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorTelefono, setErrorTelefono] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [envio, setEnvio] = useState(() => ({ desde: enviadoInicial ?? Date.now(), espera: esperaInicial }));
  // La API solo lo envía fuera de producción (y se niega a arrancar en producción si se pide mostrarlo)
  const [codigoPrueba, setCodigoPrueba] = useState(codigoInicial);
  const restante = useCuentaRegresiva(envio.desde, envio.espera);
  const digitos = telefono.replace(/\D/g, '');
  const destino = enmascarado && telefonoInicial ? enmascarado : null;

  const verificar = async (evento: FormEvent) => {
    evento.preventDefault();
    setAviso(null);
    if (digitos.length !== 9) {
      setErrorTelefono('Ingresa 9 dígitos, por ejemplo 951 234 567.');
      return;
    }
    setErrorTelefono(undefined);
    if (codigo.length !== 6) {
      setError('Escribe los 6 dígitos del código.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      alVerificar(await pedir<Sesion>('/auth/telefono/verificar', { cuerpo: { telefono: digitos, codigo } }));
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos verificar el código.');
      setCodigo('');
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    if (digitos.length !== 9) {
      setErrorTelefono('Ingresa 9 dígitos, por ejemplo 951 234 567.');
      return;
    }
    setError(null);
    try {
      const respuesta = await pedir<PasoPendiente>('/auth/telefono/enviar-codigo', { cuerpo: { telefono: digitos } });
      setEnvio({ desde: Date.now(), espera: respuesta.reenviarEn ?? 60 });
      setCodigoPrueba(respuesta.codigoDePrueba);
      setAviso('Te enviamos un código nuevo.');
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos reenviar el código.');
    }
  };

  return (
    <form className="ac-pad" onSubmit={(evento) => void verificar(evento)} noValidate>
      <div className="ac-titulo">
        <h1>{titulo}</h1>
        <p>
          {destino
            ? `Te enviamos un código de 6 dígitos por SMS al ${destino}. Vence en 10 minutos.`
            : 'Escribe tu teléfono y el código de 6 dígitos que te enviamos por SMS. Vence en 10 minutos.'}
        </p>
      </div>
      {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
      {aviso && <AvisoAcceso tono="ok">{aviso}</AvisoAcceso>}
      {!destino && (
        <CampoIcono
          etiqueta="Teléfono"
          icono="i-phone"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="951 234 567"
          value={mascaraTelefono(telefono)}
          onChange={(evento) => setTelefono(evento.target.value)}
          error={errorTelefono}
        />
      )}
      {codigoPrueba && (
        <p className="mini" data-codigo-prueba>
          <b>Solo desarrollo:</b> código de prueba {codigoPrueba}
        </p>
      )}
      <CodigoSeisDigitos valor={codigo} alCambiar={setCodigo} />
      <button className="btn p bloque" type="submit" disabled={enviando}>
        {enviando ? <Girando /> : null}
        {enviando ? 'Verificando' : 'Verificar teléfono'}
      </button>
      <button type="button" className="btn ghost bloque" onClick={() => void reenviar()} disabled={restante > 0}>
        {restante > 0 ? `Reenviar código en ${restante} s` : 'Reenviar código'}
      </button>
    </form>
  );
}
