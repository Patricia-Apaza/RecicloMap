import type { Metadata } from 'next';
import { VerificacionTelefono } from './verificacion-telefono';

export const metadata: Metadata = { title: 'Verifica tu teléfono' };

export default function PaginaVerificarTelefono() {
  return <VerificacionTelefono />;
}
