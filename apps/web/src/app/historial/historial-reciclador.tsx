'use client';

import { MarcoApp } from '@/navegacion/marco-app';
import { HistorialOperaciones } from '@/operaciones/historial';
import { Protegida } from '@/sesion/protegida';

export function HistorialReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="his">
        <HistorialOperaciones negocio={false} />
      </MarcoApp>
    </Protegida>
  );
}
