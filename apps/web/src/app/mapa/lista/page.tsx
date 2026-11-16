import type { Metadata } from 'next';
import { ListaResultados } from './lista-resultados';

export const metadata: Metadata = { title: 'Lista de resultados' };

export default function PaginaLista() {
  return <ListaResultados />;
}
