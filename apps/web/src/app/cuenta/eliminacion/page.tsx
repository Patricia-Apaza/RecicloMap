import type { Metadata } from 'next';
import { CuentaEnEliminacion } from './cuenta-en-eliminacion';

export const metadata: Metadata = { title: 'Tu cuenta está en proceso de eliminación' };

export default function Pagina() {
  return <CuentaEnEliminacion />;
}
