import type { Metadata } from 'next';
import { AvisosAdmin } from './avisos-admin';

export const metadata: Metadata = { title: 'Avisos de negocios' };

export default function Pagina() {
  return <AvisosAdmin />;
}
