'use client';

import { MarcoApp } from '@/navegacion/marco-app';
import { HistorialOperaciones } from '@/operaciones/historial';
import { Protegida } from '@/sesion/protegida';

export function HistorialNegocio() {
  return (
    <Protegida roles={['CENTRO', 'COMPRADOR_MOVIL']}>
      <MarcoApp>
        <HistorialOperaciones negocio />
      </MarcoApp>
    </Protegida>
  );
}
