import type { Metadata } from 'next';
import { EntregasReciclador } from '@/juego/entregas-reciclador';

export const metadata: Metadata = { title: 'Entrega directa' };

export default function Pagina() {
  return <EntregasReciclador />;
}
