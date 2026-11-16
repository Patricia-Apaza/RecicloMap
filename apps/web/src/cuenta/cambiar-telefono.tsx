'use client';

import { esquemaCambiarTelefono, formatearTelefono } from '@reciclomap/shared';
import { useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Campo } from '@/diseno/formulario';
import { ErrorApi, pedir } from '@/sesion/api';

// Cambiar el teléfono exige verificar el número nuevo: hasta confirmar el código, la cuenta sigue con el anterior
export function CambiarTelefono({
  abierta,
  alCerrar,
  alCambiar,
}: {
  abierta: boolean;
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const aviso = useAviso();
  const [telefono, setTelefono] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviado, setEnviado] = useState<{ telefono: string; codigoDePrueba?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    setTelefono('');
    setCodigo('');
    setEnviado(null);
    setError(null);
    alCerrar();
  };

  const pedirCodigo = async () => {
    const lectura = esquemaCambiarTelefono.safeParse({ telefono });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Revisa el número.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await pedir<{ codigoDePrueba?: string }>('/yo/telefono/cambiar', { cuerpo: lectura.data });
      setEnviado({ telefono: lectura.data.telefono, codigoDePrueba: respuesta.codigoDePrueba });
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar el código.');
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!enviado) return;
    if (!/^\d{6}$/.test(codigo)) {
      setError('El código tiene 6 dígitos.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await pedir('/yo/telefono/confirmar', { cuerpo: { telefono: enviado.telefono, codigo } });
      aviso('Tu número quedó verificado.');
      alCambiar();
      cerrar();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos verificar el código.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana
      abierta={abierta}
      alCerrar={cerrar}
      antetitulo="TELÉFONO"
      titulo={enviado ? 'Escribe el código' : 'Cambia tu número'}
    >
      {enviado ? (
        <>
          <p className="mini">
            Te enviamos un código por SMS al {formatearTelefono(enviado.telefono)}. Hasta que lo confirmes, tu cuenta
            sigue con el número anterior.
          </p>
          {enviado.codigoDePrueba && <p className="mini">Código de prueba: {enviado.codigoDePrueba}</p>}
          <Campo
            etiqueta="Código de 6 dígitos"
            inputMode="numeric"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            error={error ?? undefined}
          />
          <button type="button" className="btn p" disabled={enviando} onClick={() => void confirmar()}>
            {enviando ? 'Verificando…' : 'Verificar número'}
          </button>
        </>
      ) : (
        <>
          <p className="mini">Es tu WhatsApp y tu forma de entrar. Te enviaremos un código para verificarlo.</p>
          <Campo
            etiqueta="Número nuevo"
            prefijo="+51"
            inputMode="numeric"
            maxLength={11}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            error={error ?? undefined}
          />
          <button type="button" className="btn p" disabled={enviando} onClick={() => void pedirCodigo()}>
            {enviando ? 'Enviando…' : 'Enviar código'}
          </button>
        </>
      )}
      <button type="button" className="btn ghost" onClick={cerrar}>
        Volver
      </button>
    </Ventana>
  );
}
