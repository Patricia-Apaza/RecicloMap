import type { Metadata } from 'next';
import { PerfilReciclador } from '@/juego/perfil';

export const metadata: Metadata = { title: 'Mi perfil' };

export default function Pagina() {
  return <PerfilReciclador />;
}
