import type { Metadata } from 'next';
import { PlanAvisos } from './plan-avisos';

export const metadata: Metadata = { title: 'Plan y avisos' };

export default function Pagina() {
  return <PlanAvisos />;
}
