import type { Metadata } from 'next';
import { RankingReciclador } from '@/juego/ranking';

export const metadata: Metadata = { title: 'Ranking' };

export default function Pagina() {
  return <RankingReciclador />;
}
