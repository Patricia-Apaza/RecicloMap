import type { Metadata } from 'next';
import { EditarPerfil } from './editar-perfil';

export const metadata: Metadata = { title: 'Editar perfil' };

export default function Pagina() {
  return <EditarPerfil />;
}
