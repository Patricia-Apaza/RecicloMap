import type { Metadata } from 'next';
import { Ayuda } from './ayuda';

export const metadata: Metadata = { title: 'Centro de ayuda' };

export default function Pagina() {
  return <Ayuda />;
}
