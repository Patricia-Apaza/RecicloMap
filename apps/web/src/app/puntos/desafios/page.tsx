import type { Metadata } from 'next';
import { DesafiosReciclador } from '@/juego/desafios';

export const metadata: Metadata = { title: 'Desafíos del mes' };

export default function Pagina() {
  return <DesafiosReciclador />;
}
