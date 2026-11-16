import type { Metadata } from 'next';
import { DetallePublicacionPropia } from './detalle-publicacion';

export const metadata: Metadata = { title: 'Mi publicación' };

export default async function PaginaDetallePublicacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetallePublicacionPropia id={id} />;
}
