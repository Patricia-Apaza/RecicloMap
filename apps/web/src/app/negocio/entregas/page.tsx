import type { Metadata } from 'next';
import { EntregasNegocio } from '@/juego/entregas-negocio';

export const metadata: Metadata = { title: 'Entregas directas' };

export default function Pagina() {
  return <EntregasNegocio />;
}
