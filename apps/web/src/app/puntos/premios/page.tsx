import type { Metadata } from 'next';
import { MisPremios } from '@/juego/premios';

export const metadata: Metadata = { title: 'Mis premios' };

export default function Pagina() {
  return <MisPremios />;
}
