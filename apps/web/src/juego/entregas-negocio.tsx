'use client';

import {
  esquemaConfirmarEntrega,
  esquemaRechazarEntrega,
  formatearFecha,
  TEXTO_ENTREGA_DIRECTA,
} from '@reciclomap/shared';
import { useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina, EstadoVacio, Nota } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { FONDO_MATERIAL } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { kg, textoVence } from './piezas';
import type { EntregaNegocio } from './tipos';
import { useDatos } from './usar-datos';

const TONO = {
  PENDIENTE: 'pill warn',
  CONFIRMADO: 'pill open',
  RECHAZADO: 'pill closed',
  VENCIDO: 'pill grey',
} as const;

// Entregas directas que los recicladores registran a este negocio: se confirma con los kilos recibidos o se rechaza
function Contenido() {
  const aviso = useAviso();
  const [filtro, setFiltro] = useState<'pendientes' | 'todas'>('pendientes');
  const [version, setVersion] = useState(0);
  const { datos } = useDatos<{ datos: EntregaNegocio[] }>(`/mi-negocio/entregas-directas?estado=${filtro}`, version);
  const [confirmando, setConfirmando] = useState<EntregaNegocio | null>(null);
  const [rechazando, setRechazando] = useState<EntregaNegocio | null>(null);
  const [kilos, setKilos] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    setConfirmando(null);
    setRechazando(null);
    setError(null);
  };
  const abrirConfirmar = (e: EntregaNegocio) => {
    setKilos(String(e.kg));
    setError(null);
    setConfirmando(e);
  };
  const abrirRechazar = (e: EntregaNegocio) => {
    setMotivo('');
    setError(null);
    setRechazando(e);
  };

  const enviar = async (ruta: string, cuerpo: unknown, mensaje: string) => {
    setEnviando(true);
    try {
      await pedir(ruta, { cuerpo });
      aviso(mensaje);
      cerrar();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar la respuesta.');
    } finally {
      setEnviando(false);
      setVersion((v) => v + 1);
    }
  };

  const confirmar = () => {
    if (!confirmando) return;
    const lectura = esquemaConfirmarEntrega.safeParse({ kg: kilos });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Escribe los kilos recibidos.');
      return;
    }
    void enviar(`/mi-negocio/entregas-directas/${confirmando.id}/confirmar`, lectura.data, 'Entrega confirmada');
  };
  const rechazar = () => {
    if (!rechazando) return;
    const lectura = esquemaRechazarEntrega.safeParse({ motivo });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Cuéntanos el motivo.');
      return;
    }
    void enviar(`/mi-negocio/entregas-directas/${rechazando.id}/rechazar`, lectura.data, 'Entrega rechazada');
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi negocio"
        titulo="Entregas"
        resaltado="directas"
        descripcion="Recicladores que dicen haberte entregado material sin publicarlo. Confirma los kilos que recibiste o recházalo."
        acciones={
          <div className="seg" role="group" aria-label="Mostrar">
            <button type="button" aria-pressed={filtro === 'pendientes'} onClick={() => setFiltro('pendientes')}>
              Por confirmar
            </button>
            <button type="button" aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>
              Todas
            </button>
          </div>
        }
      />
      <Nota>
        Los pagos ocurren fuera de RecicloMap. Aquí solo confirmas el material y los kilos: el valor que confirmes es el
        que cuenta.
      </Nota>
      <div className="list" style={{ gap: 14, marginTop: 16 }} data-entregas>
        {datos === null && <span className="girando" role="status" aria-label="Cargando" />}
        {datos?.datos.length === 0 && (
          <EstadoVacio
            icono="i-check"
            titulo={filtro === 'pendientes' ? 'No tienes entregas por confirmar' : 'Aún no hay entregas registradas'}
          />
        )}
        {datos?.datos.map((e) => (
          <div
            key={e.id}
            data-entrega={e.id}
            data-estado={e.estado}
            className="panel row g16 wr"
            style={{ padding: '14px 18px' }}
          >
            <span className="mi" style={{ width: 48, height: 48, background: FONDO_MATERIAL[e.material.codigo] }}>
              <Icono nombre={ICONO_MATERIAL[e.material.codigo]} />
            </span>
            <div style={{ flex: 1, minWidth: 190 }}>
              <b style={{ font: '700 17px var(--head)' }}>
                {e.material.nombre} · {kg(e.kgConfirmado ?? e.kg)} kg
              </b>
              <div className="mini">
                {e.reciclador}
                {e.nivel ? ` · ${e.nivel}` : ''} · {formatearFecha(e.fecha)}
              </div>
              {e.estado === 'PENDIENTE' && <div className="mini">{textoVence(e.venceEn)}</div>}
            </div>
            {e.estado === 'PENDIENTE' ? (
              <div className="row g8">
                <button type="button" className="btn p sm" onClick={() => abrirConfirmar(e)}>
                  Confirmar
                </button>
                <button type="button" className="btn sm" onClick={() => abrirRechazar(e)}>
                  Rechazar
                </button>
              </div>
            ) : (
              <span className={TONO[e.estado]}>
                <i />
                {TEXTO_ENTREGA_DIRECTA[e.estado]}
              </span>
            )}
          </div>
        ))}
      </div>

      <Ventana
        abierta={confirmando !== null}
        alCerrar={cerrar}
        antetitulo="CONFIRMAR ENTREGA"
        titulo={`¿Cuántos kilos recibiste de ${confirmando?.material.nombre.toLowerCase() ?? ''}?`}
      >
        <p className="mini">
          {confirmando?.reciclador} registró {confirmando ? kg(confirmando.kg) : ''} kg. Pesa el material y confirma los
          kilos reales: puedes ajustarlos.
        </p>
        <Campo
          etiqueta="Kilos recibidos"
          sufijo="kg"
          inputMode="decimal"
          value={kilos}
          onChange={(e) => setKilos(e.target.value)}
          error={error ?? undefined}
        />
        <div className="row g8" style={{ marginTop: 12 }}>
          <button type="button" className="btn p" disabled={enviando} onClick={confirmar}>
            Confirmar entrega
          </button>
          <button type="button" className="btn" onClick={cerrar}>
            Cancelar
          </button>
        </div>
      </Ventana>

      <Ventana
        abierta={rechazando !== null}
        alCerrar={cerrar}
        antetitulo="RECHAZAR ENTREGA"
        titulo="¿Por qué la rechazas?"
      >
        <Campo
          etiqueta="Motivo"
          maxLength={200}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={error ?? undefined}
          placeholder="Ej. No recibí ese material"
        />
        <div className="row g8" style={{ marginTop: 12 }}>
          <button type="button" className="btn p" disabled={enviando} onClick={rechazar}>
            Rechazar entrega
          </button>
          <button type="button" className="btn" onClick={cerrar}>
            Cancelar
          </button>
        </div>
      </Ventana>
    </>
  );
}

export function EntregasNegocio() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
