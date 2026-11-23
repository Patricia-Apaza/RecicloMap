import type { Metadata } from 'next';
import { InsigniasReciclador } from '@/juego/insignias';

export const metadata: Metadata = { title: 'Insignias' };

export default function Pagina() {
  return <InsigniasReciclador />;
}
