import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegistroComprador } from './registro-comprador';

export const metadata: Metadata = { title: 'Crea tu perfil de comprador' };

export default function PaginaRegistroComprador() {
  return (
    <Suspense>
      <RegistroComprador />
    </Suspense>
  );
}
