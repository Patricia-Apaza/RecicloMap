import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportarInformacion } from './reportar-informacion';

export const metadata: Metadata = { title: 'Reportar información' };

export default function Pagina() {
  return (
    <Suspense>
      <ReportarInformacion />
    </Suspense>
  );
}
