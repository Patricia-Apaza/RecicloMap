import type { Metadata } from 'next';
import { MapaCompradores } from './mapa-compradores';

export const metadata: Metadata = { title: 'Mapa' };

export default function PaginaMapa() {
  return <MapaCompradores />;
}
