import type { Metadata } from 'next';
import { OfertasEnviadasPagina } from './ofertas-enviadas';

export const metadata: Metadata = { title: 'Ofertas enviadas' };

export default function PaginaOfertasEnviadas() {
  return <OfertasEnviadasPagina />;
}
