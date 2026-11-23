import type { Metadata } from 'next';
import { Ruleta } from '@/juego/ruleta';

export const metadata: Metadata = { title: 'Ruleta de premios' };

export default function Pagina() {
  return <Ruleta />;
}
