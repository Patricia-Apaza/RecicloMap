import type { Metadata } from 'next';
import { EstadoVacio } from '@/diseno/bloques';

export const metadata: Metadata = { title: 'Sin conexión', robots: { index: false } };

export default function SinConexion() {
  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <EstadoVacio
        icono="i-alert"
        titulo="Sin conexión"
        descripcion="No pudimos conectarnos. Revisa tus datos o tu wifi e inténtalo de nuevo."
        accion={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- recarga completa a propósito, sin conexión
          <a className="btn sm p" href="/">
            Reintentar
          </a>
        }
      />
    </main>
  );
}
