import type { Metadata } from 'next';
import { PanelAdmin } from './panel-admin';

export const metadata: Metadata = { title: 'Panel de control' };

export default function PaginaAdmin() {
  return <PanelAdmin />;
}
