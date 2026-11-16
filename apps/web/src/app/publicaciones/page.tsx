import type { Metadata } from 'next';
import { MisPublicaciones } from './mis-publicaciones';

export const metadata: Metadata = { title: 'Mis publicaciones' };

export default function PaginaMisPublicaciones() {
  return <MisPublicaciones />;
}
