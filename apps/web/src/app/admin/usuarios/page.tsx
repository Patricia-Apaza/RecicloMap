import type { Metadata } from 'next';
import { UsuariosAdmin } from './usuarios-admin';

export const metadata: Metadata = { title: 'Gestión de usuarios' };

export default function Pagina() {
  return <UsuariosAdmin />;
}
