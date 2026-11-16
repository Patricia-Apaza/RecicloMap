import type { Metadata } from 'next';
import { PanelEstadisticas } from '@/negocio/panel-estadisticas';

export const metadata: Metadata = { title: 'Mis estadísticas' };

export default function Pagina() {
  return <PanelEstadisticas movil />;
}
