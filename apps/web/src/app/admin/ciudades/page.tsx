import type { Metadata } from 'next';
import { CiudadesAdmin } from './ciudades-admin';

export const metadata: Metadata = { title: 'Ciudades y zonas' };

export default function Pagina() {
  return <CiudadesAdmin />;
}
