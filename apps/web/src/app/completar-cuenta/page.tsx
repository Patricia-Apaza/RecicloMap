import type { Metadata } from 'next';
import { CompletarCuenta } from './completar-cuenta';

export const metadata: Metadata = { title: 'Completa tu cuenta' };

export default function PaginaCompletarCuenta() {
  return <CompletarCuenta />;
}
