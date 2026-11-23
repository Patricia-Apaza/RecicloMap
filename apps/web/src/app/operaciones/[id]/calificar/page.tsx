import type { Metadata } from 'next';
import { Calificar } from './calificar';

export const metadata: Metadata = { title: 'Calificar la operación' };

export default async function PaginaCalificar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Calificar id={id} />;
}
