import type { Metadata } from 'next';
import { SeccionAvisos } from './seccion-avisos';

export const metadata: Metadata = { title: 'Avisos de negocios' };

export default function Pagina() {
  return <SeccionAvisos />;
}
