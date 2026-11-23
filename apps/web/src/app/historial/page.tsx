import type { Metadata } from 'next';
import { HistorialReciclador } from './historial-reciclador';

export const metadata: Metadata = { title: 'Historial de operaciones' };

export default function PaginaHistorial() {
  return <HistorialReciclador />;
}
