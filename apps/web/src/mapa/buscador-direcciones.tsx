'use client';

import { useState } from 'react';
import { Icono } from '@/diseno/icono';
import { ErrorApi, pedir } from '@/sesion/api';

type Resultado = { nombre: string; lat: number; lng: number };

// Búsqueda de direcciones: solo al tocar «Buscar» (o Enter), nunca mientras se escribe. Pasa por nuestro servidor
export function BuscadorDirecciones({ alElegir }: { alElegir: (punto: { lat: number; lng: number }) => void }) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const buscar = async () => {
    const consulta = texto.trim();
    if (consulta.length < 3) {
      setMensaje('Escribe al menos 3 letras de la dirección.');
      return;
    }
    setBuscando(true);
    setMensaje(null);
    try {
      const r = await pedir<{ resultados: Resultado[] }>(`/direcciones/buscar?q=${encodeURIComponent(consulta)}`);
      setResultados(r.resultados);
      if (r.resultados.length === 0) setMensaje('No encontramos esa dirección. Toca el mapa para colocar el pin.');
    } catch (causa) {
      setResultados(null);
      setMensaje(
        causa instanceof ErrorApi ? causa.message : 'No pudimos buscar la dirección. Toca el mapa para colocar el pin.',
      );
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }} data-buscador-direcciones>
      <label className="lbl" htmlFor="buscar-direccion">
        Buscar la dirección de tu local
      </label>
      <div className="row g8">
        <input
          id="buscar-direccion"
          className="inp"
          style={{ flex: 1 }}
          type="search"
          autoComplete="off"
          placeholder="Ej.: Jr. Moquegua 450, Juliaca"
          value={texto}
          maxLength={120}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              void buscar();
            }
          }}
        />
        <button type="button" className="btn p" disabled={buscando} onClick={() => void buscar()}>
          <Icono nombre="i-search" />
          {buscando ? 'Buscando' : 'Buscar'}
        </button>
      </div>
      {mensaje && (
        <p className="mini" role="status">
          {mensaje}
        </p>
      )}
      {resultados && resultados.length > 0 && (
        <ul
          className="list"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
          aria-label="Resultados de la búsqueda"
        >
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="btn ghost sm"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  height: 'auto',
                  padding: '8px 12px',
                }}
                onClick={() => {
                  alElegir({ lat: r.lat, lng: r.lng });
                  setResultados(null);
                }}
              >
                {r.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
