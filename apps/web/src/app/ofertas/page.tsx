import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OfertasRecibidasPagina } from './ofertas-recibidas';

export const metadata: Metadata = { title: 'Ofertas recibidas' };

export default function PaginaOfertas() {
  return (
    <Suspense>
      <OfertasRecibidasPagina />
    </Suspense>
  );
}
