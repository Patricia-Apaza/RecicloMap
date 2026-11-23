import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportesAdmin } from './reportes-admin';

export const metadata: Metadata = { title: 'Reportes de usuarios' };

export default function Pagina() {
  return (
    <Suspense>
      <ReportesAdmin />
    </Suspense>
  );
}
