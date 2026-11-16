import type { Metadata } from 'next';
import { RegistroReciclador } from './registro-reciclador';

export const metadata: Metadata = { title: 'Crea tu cuenta' };

export default function PaginaRegistroReciclador() {
  return <RegistroReciclador />;
}
