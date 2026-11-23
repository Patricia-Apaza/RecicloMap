import type { Metadata } from 'next';
import { RutaDelDia } from './ruta-del-dia';

export const metadata: Metadata = { title: 'Ruta de hoy' };

export default function Pagina() {
  return <RutaDelDia />;
}
