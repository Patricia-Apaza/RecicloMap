'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { pedir, type RolCuenta } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { MarcoApp } from './marco-app';
import { RUTAS } from './rutas';

// Los centros registrados antes del mapa aún no tienen pin: se les pide colocarlo
export function AvisoPin() {
  const [falta, setFalta] = useState(false);
  useEffect(() => {
    let vigente = true;
    pedir<{ negocio: { ubicacionConfirmada: boolean } | null }>('/mi-negocio')
      .then((respuesta) => vigente && setFalta(respuesta.negocio?.ubicacionConfirmada === false))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);
  if (!falta) return null;
  return (
    <div className="note warn" role="status" style={{ marginBottom: 20 }} data-aviso="pin">
      <Icono nombre="i-pin" />
      <span>
        <b>Coloca el pin de tu local.</b> Hoy tu distancia se calcula desde el centro de tu zona.{' '}
        <Link href={RUTAS.preciosDemanda}>Colocar el pin</Link>
      </span>
    </div>
  );
}

// Inicio de los negocios verificados mientras se construye su panel
export function PanelProvisional({
  rol,
  activa,
}: {
  rol: Extract<RolCuenta, 'CENTRO' | 'COMPRADOR_MOVIL'>;
  activa: string;
}) {
  return (
    <Protegida roles={[rol]}>
      <MarcoApp activa={activa}>
        <div className="ph">
          <div>
            <span className="kick">{rol === 'CENTRO' ? 'Centro de acopio' : 'Comprador móvil'}</span>
            <h1>
              Tu negocio está <u>verificado</u>
            </h1>
            <p>Ya apareces en el mapa para los recicladores de Juliaca.</p>
          </div>
        </div>
        {rol === 'CENTRO' && <AvisoPin />}
        <div className="empty" role="status" style={{ padding: '44px 24px' }}>
          <span className="ico m" style={{ width: 64, height: 64 }}>
            <Icono nombre="i-activity" tamano="lg" />
          </span>
          <b style={{ font: '800 22px var(--head)', color: 'var(--ink)' }}>Tu resumen está por llegar</b>
          <span style={{ maxWidth: 520 }}>
            Ya puedes ver el material que publican los recicladores de tu ciudad, enviar ofertas y mantener tus precios
            al día.
          </span>
          <div className="row g8 wr" style={{ justifyContent: 'center' }}>
            <Link className="btn p" href={RUTAS.publicacionesCercanas}>
              Ver publicaciones cercanas
            </Link>
            <Link className="btn" href={RUTAS.ofertasEnviadas}>
              Ofertas enviadas
            </Link>
            <Link className="btn" href={RUTAS.preciosDemanda}>
              Actualizar mis precios
            </Link>
          </div>
        </div>
      </MarcoApp>
    </Protegida>
  );
}
