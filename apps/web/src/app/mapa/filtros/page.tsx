import type { Metadata } from 'next';
import { BusquedaFiltros } from './busqueda-filtros';

export const metadata: Metadata = { title: 'Búsqueda y filtros' };

export default function PaginaFiltros() {
  return <BusquedaFiltros />;
}
