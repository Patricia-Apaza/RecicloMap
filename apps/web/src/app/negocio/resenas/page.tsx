import type { Metadata } from 'next';
import { ResenasRecibidas } from './resenas-recibidas';

export const metadata: Metadata = { title: 'Reseñas recibidas' };

export default function PaginaResenasRecibidas() {
  return <ResenasRecibidas />;
}
