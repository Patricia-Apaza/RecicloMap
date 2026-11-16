import type { Metadata } from 'next';
import { ModeracionPrecios } from './moderacion-precios';

export const metadata: Metadata = { title: 'Moderación de precios' };

export default function Pagina() {
  return <ModeracionPrecios />;
}
