import type { Metadata } from 'next';
import { Bandeja } from './bandeja';

export const metadata: Metadata = { title: 'Notificaciones' };

export default function PaginaNotificaciones() {
  return <Bandeja />;
}
