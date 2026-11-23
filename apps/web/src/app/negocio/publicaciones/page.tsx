import type { Metadata } from 'next';
import { PublicacionesCercanas } from './publicaciones-cercanas';

export const metadata: Metadata = { title: 'Publicaciones cercanas' };

export default function PaginaPublicacionesCercanas() {
  return <PublicacionesCercanas />;
}
