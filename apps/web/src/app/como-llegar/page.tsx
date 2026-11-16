import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ComoLlegar } from './como-llegar';

export const metadata: Metadata = { title: 'Cómo llegar' };

export default function Pagina() {
  return (
    <Suspense>
      <ComoLlegar />
    </Suspense>
  );
}
