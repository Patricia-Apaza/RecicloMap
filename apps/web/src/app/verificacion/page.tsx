import type { Metadata } from 'next';
import { EstadoVerificacionNegocio } from './estado-verificacion';

export const metadata: Metadata = { title: 'Verificación de tu negocio' };

export default function PaginaVerificacion() {
  return <EstadoVerificacionNegocio />;
}
