import type { Metadata } from 'next';
import { ColaPlan } from './cola-plan';

export const metadata: Metadata = { title: 'Plan Pro' };

export default function Pagina() {
  return <ColaPlan />;
}
