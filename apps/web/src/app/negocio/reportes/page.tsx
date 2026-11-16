import type { Metadata } from 'next';
import { ReportesNegocio } from './reportes-negocio';

export const metadata: Metadata = { title: 'Reportes sobre mi negocio' };

export default function Pagina() {
  return <ReportesNegocio />;
}
