import type { Metadata } from 'next';
import { InicioSesion } from './inicio-sesion';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function PaginaIngresar() {
  return <InicioSesion />;
}
