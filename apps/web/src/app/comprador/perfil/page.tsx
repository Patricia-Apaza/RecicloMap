import type { Metadata } from 'next';
import { PerfilMovil } from './perfil-movil';

export const metadata: Metadata = { title: 'Mi perfil' };

export default function Pagina() {
  return <PerfilMovil />;
}
