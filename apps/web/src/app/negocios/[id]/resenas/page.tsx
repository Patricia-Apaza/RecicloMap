import type { Metadata } from 'next';
import { ResenasPublicas } from './resenas-publicas';

export const metadata: Metadata = { title: 'Reseñas del negocio' };

export default async function PaginaResenas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResenasPublicas id={id} />;
}
