'use client';

import { CUANDO_RECOGE, esquemaOferta, LARGO_MENSAJE_OFERTA } from '@reciclomap/shared';
import { useId, useState } from 'react';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Campo } from '@/diseno/formulario';
import { ErrorApi, pedir } from '@/sesion/api';
import { kilos, soles } from './piezas';
import type { MaterialRef, MiOferta } from './tipos';

type Objetivo = { id: string; material: MaterialRef; kg: number; miPrecio?: { min: string; max: string } | null };

// Pantallas 42 y 44: el total se calcula al escribir; el servidor lo vuelve a calcular y lo guarda
export function DialogoOferta({
  objetivo,
  actual,
  alCerrar,
  alEnviar,
}: {
  objetivo: Objetivo | null;
  actual: MiOferta | null;
  alCerrar: () => void;
  alEnviar: (oferta: MiOferta) => void;
}) {
  const aviso = useAviso();
  const id = useId();
  const cambiando = actual?.estado === 'PENDIENTE';
  const [precio, setPrecio] = useState(cambiando ? actual.precioKg : '');
  const [cuando, setCuando] = useState<string>(CUANDO_RECOGE[0]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  if (!objetivo) return null;

  const valor = Number(precio.replace(',', '.'));
  const total = Number.isFinite(valor) && valor > 0 ? valor * objetivo.kg : 0;

  const enviar = async () => {
    const lectura = esquemaOferta.safeParse({ precioKg: precio, mensaje, cuandoRecoge: cuando });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Revisa el precio.');
      return;
    }
    setEnviando(true);
    try {
      const oferta = cambiando
        ? await pedir<MiOferta>(`/negocio/ofertas/${actual.id}`, { metodo: 'PUT', cuerpo: lectura.data })
        : await pedir<MiOferta>(`/negocio/publicaciones/${objetivo.id}/ofertas`, { cuerpo: lectura.data });
      aviso(
        cambiando
          ? 'Oferta cambiada. Avisamos al reciclador.'
          : `Oferta enviada: ${soles(oferta.total)} por ${kilos(objetivo.kg)} kg. Te avisaremos si la aceptan.`,
      );
      alEnviar(oferta);
    } catch (causa) {
      const texto = causa instanceof ErrorApi ? causa.message : 'No pudimos enviar tu oferta. Intenta de nuevo.';
      setError(texto);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Ventana
      abierta
      alCerrar={alCerrar}
      antetitulo={cambiando ? 'CAMBIAR OFERTA' : 'HACER OFERTA'}
      titulo={`${objetivo.material.nombre} · ${kilos(objetivo.kg)} kg`}
    >
      <Campo
        etiqueta="Tu precio por kilo"
        prefijo="S/"
        sufijo="por kg"
        inputMode="decimal"
        placeholder="Ej. 2.70"
        value={precio}
        onChange={(evento) => {
          setPrecio(evento.target.value);
          setError(null);
        }}
        error={error ?? undefined}
        ayuda={
          objetivo.miPrecio ? `Tu rango publicado: ${soles(objetivo.miPrecio.min)}–${objetivo.miPrecio.max}` : undefined
        }
      />
      <div
        style={{
          background: 'var(--paper)',
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span>Total a ofrecer</span>
        <b className="mono" style={{ font: '600 22px var(--mono)' }} data-total>
          {soles(total)}
        </b>
      </div>
      <div className="field">
        <label htmlFor={`${id}-cuando`}>¿Cuándo puedes recoger?</label>
        <div className="inp">
          <select id={`${id}-cuando`} value={cuando} onChange={(evento) => setCuando(evento.target.value)}>
            {CUANDO_RECOGE.map((opcion) => (
              <option key={opcion}>{opcion}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-mensaje`}>
          Mensaje <span className="opt">(opcional)</span>
        </label>
        <div className="inp ta">
          <textarea
            id={`${id}-mensaje`}
            maxLength={LARGO_MENSAJE_OFERTA}
            style={{ height: 70 }}
            placeholder="Ej. Puedo recoger hoy por la tarde."
            value={mensaje}
            onChange={(evento) => setMensaje(evento.target.value)}
          />
        </div>
      </div>
      <p className="mini">
        El reciclador compara las ofertas y acepta una. El pago lo acuerdan entre ustedes, fuera de RecicloMap.
      </p>
      <button type="button" className="btn p" disabled={enviando} onClick={() => void enviar()}>
        {enviando ? 'Enviando…' : cambiando ? 'Guardar cambio' : 'Enviar oferta'}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}
