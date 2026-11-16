import type { Metadata } from 'next';
import { ResumenCentro } from './resumen-centro';

export const metadata: Metadata = { title: 'Mi negocio' };

export default function PaginaNegocio() {
  return <ResumenCentro />;
}
