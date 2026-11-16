import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegistroCentro } from './registro-centro';

export const metadata: Metadata = { title: 'Registra tu centro' };

export default function PaginaRegistroCentro() {
  return (
    <Suspense>
      <RegistroCentro />
    </Suspense>
  );
}
