import { redirect } from 'next/navigation';
import { RUTAS } from '@/navegacion/rutas';

// El panel de administración (57) llega en una fase posterior; por ahora se entra a la cola de verificación
export default function PaginaAdmin() {
  redirect(RUTAS.adminVerificaciones);
}
