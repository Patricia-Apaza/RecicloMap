import type { Metadata } from 'next';
import { PremiosAdmin } from './premios-admin';

export const metadata: Metadata = { title: 'Premios y ruleta' };

export default function Pagina() {
  return <PremiosAdmin />;
}
