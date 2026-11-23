import type { Metadata } from 'next';
import { AuditoriaAdmin } from './auditoria-admin';

export const metadata: Metadata = { title: 'Registro de auditoría' };

export default function Pagina() {
  return <AuditoriaAdmin />;
}
