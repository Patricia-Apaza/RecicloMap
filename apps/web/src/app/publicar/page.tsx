import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PublicarMaterial } from './publicar-material';

export const metadata: Metadata = { title: 'Publicar material' };

export default function PaginaPublicar() {
  return (
    <Suspense>
      <PublicarMaterial />
    </Suspense>
  );
}
