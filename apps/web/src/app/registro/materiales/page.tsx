import type { Metadata } from 'next';
import { RegistroMateriales } from './registro-materiales';

export const metadata: Metadata = { title: 'Tus materiales' };

export default function PaginaRegistroMateriales() {
  return <RegistroMateriales />;
}
