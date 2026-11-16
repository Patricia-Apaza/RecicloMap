import type { Metadata } from 'next';
import { PreciosDemanda } from './precios-demanda';

export const metadata: Metadata = { title: 'Precios y demanda' };

export default function PaginaPreciosDemanda() {
  return <PreciosDemanda />;
}
