import type { Metadata } from 'next';
import { MisResenas } from './mis-resenas';

export const metadata: Metadata = { title: 'Reseñas que recibí' };

export default function Pagina() {
  return <MisResenas />;
}
