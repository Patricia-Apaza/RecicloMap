import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Calculadora } from './calculadora';

export const metadata: Metadata = { title: 'Calculadora de valor' };

export default function Pagina() {
  return (
    <Suspense>
      <Calculadora />
    </Suspense>
  );
}
