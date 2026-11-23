import type { Metadata } from 'next';
import { NivelesReciclador } from '@/juego/niveles';

export const metadata: Metadata = { title: 'Mis niveles' };

export default function Pagina() {
  return <NivelesReciclador />;
}
