import type { Metadata } from 'next';
import { HistorialNegocio } from './historial-negocio';

export const metadata: Metadata = { title: 'Historial de compras' };

export default function PaginaHistorialCompras() {
  return <HistorialNegocio />;
}
