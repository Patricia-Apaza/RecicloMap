import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportarProblema } from './reportar-problema';

export const metadata: Metadata = { title: 'Reportar un problema' };

export default function Pagina() {
  return (
    <Suspense>
      <ReportarProblema />
    </Suspense>
  );
}
