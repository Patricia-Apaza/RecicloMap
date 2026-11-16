import type { Metadata } from 'next';
import { PuntosReciclador } from '@/juego/puntos';

export const metadata: Metadata = { title: 'Puntos y niveles' };

export default function Pagina() {
  return <PuntosReciclador />;
}
