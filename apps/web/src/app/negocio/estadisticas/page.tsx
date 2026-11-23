import type { Metadata } from 'next';
import { PanelEstadisticas } from '@/negocio/panel-estadisticas';

export const metadata: Metadata = { title: 'Estadísticas del negocio' };

export default function Pagina() {
  return <PanelEstadisticas movil={false} />;
}
