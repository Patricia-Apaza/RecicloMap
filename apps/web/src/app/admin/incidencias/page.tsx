import type { Metadata } from 'next';
import { Incidencias } from './incidencias';

export const metadata: Metadata = { title: 'Incidencias de operaciones' };

export default function PaginaIncidencias() {
  return <Incidencias />;
}
