import type { Metadata } from 'next';
import { Terminos } from './terminos';

export const metadata: Metadata = { title: 'Términos y privacidad' };

export default function PaginaTerminos() {
  return <Terminos />;
}
