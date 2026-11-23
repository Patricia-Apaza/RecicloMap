import type { Metadata } from 'next';
import { DatosNegocio } from './datos-negocio';

export const metadata: Metadata = { title: 'Datos y horarios' };

export default function Pagina() {
  return <DatosNegocio />;
}
