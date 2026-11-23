import type { Metadata } from 'next';
import { Seguimiento } from './seguimiento';

export const metadata: Metadata = { title: 'Seguimiento de la operación' };

export default async function PaginaOperacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Seguimiento id={id} />;
}
