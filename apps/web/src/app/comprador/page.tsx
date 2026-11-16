import type { Metadata } from 'next';
import { InicioComprador } from './inicio-comprador';

export const metadata: Metadata = { title: 'Inicio del comprador' };

export default function PaginaComprador() {
  return <InicioComprador />;
}
