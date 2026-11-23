import type { Metadata } from 'next';
import { Favoritos } from './favoritos';

export const metadata: Metadata = { title: 'Favoritos' };

export default function Pagina() {
  return <Favoritos />;
}
