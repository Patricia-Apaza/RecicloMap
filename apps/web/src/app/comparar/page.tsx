import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Comparar } from './comparar';

export const metadata: Metadata = { title: 'Comparar compradores' };

export default function Pagina() {
  return (
    <Suspense>
      <Comparar />
    </Suspense>
  );
}
