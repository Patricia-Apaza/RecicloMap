import type { Metadata } from 'next';
import { ColaVerificacion } from './cola-verificacion';

export const metadata: Metadata = { title: 'Verificaciones' };

export default function PaginaVerificaciones() {
  return <ColaVerificacion />;
}
