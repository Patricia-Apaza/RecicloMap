import type { Metadata } from 'next';
import { DetalleCercanaPagina } from './detalle-cercana';

export const metadata: Metadata = { title: 'Publicación cercana' };

export default async function PaginaDetalleCercana({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleCercanaPagina id={id} />;
}
