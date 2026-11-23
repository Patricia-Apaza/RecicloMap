import type { Metadata } from 'next';
import { AceptarTextos } from './aceptar-textos';

export const metadata: Metadata = { title: 'Textos legales actualizados' };

export default function Pagina() {
  return <AceptarTextos />;
}
