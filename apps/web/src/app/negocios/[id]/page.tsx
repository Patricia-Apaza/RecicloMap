import type { Metadata } from 'next';
import { DetalleNegocio } from './detalle-negocio';

export const metadata: Metadata = { title: 'Detalle del negocio' };

export default async function PaginaDetalleNegocio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleNegocio id={id} />;
}
