import type { Metadata } from 'next';
import { ConfiguracionAdmin } from './configuracion-admin';

export const metadata: Metadata = { title: 'Configuración general' };

export default function Pagina() {
  return <ConfiguracionAdmin />;
}
