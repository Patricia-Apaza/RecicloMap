import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContenidoGuia } from './contenido-guia';

// Página interna para comparar con la guía del prototipo: solo en desarrollo y en compilaciones de prueba
const DISPONIBLE = process.env.NODE_ENV !== 'production' || process.env.RM_PAGINAS_INTERNAS === '1';

export const metadata: Metadata = {
  title: 'Guía de estilo',
  robots: { index: false, follow: false },
};

export default function PaginaGuia() {
  if (!DISPONIBLE) notFound();
  return <ContenidoGuia />;
}
