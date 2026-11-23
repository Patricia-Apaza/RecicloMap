import type { Metadata } from 'next';
import { RecuperarContrasena } from './recuperar-contrasena';

export const metadata: Metadata = { title: 'Recupera tu contraseña' };

export default function PaginaRecuperar() {
  return <RecuperarContrasena />;
}
