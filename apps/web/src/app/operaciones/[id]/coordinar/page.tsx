import type { Metadata } from 'next';
import { Coordinar } from './coordinar';

export const metadata: Metadata = { title: 'Coordinar la entrega' };

export default async function PaginaCoordinar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Coordinar id={id} />;
}
