import type { Metadata } from 'next';
import Link from 'next/link';
import { EstadoVacio } from '@/diseno/bloques';

export const metadata: Metadata = { title: 'Página no encontrada', robots: { index: false } };

export default function NoEncontrada() {
  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <EstadoVacio
        icono="i-search"
        titulo="No encontramos esta página"
        descripcion="Puede que el enlace esté mal escrito o que la página todavía no esté disponible."
        accion={
          <Link className="btn sm p" href="/">
            Ir al inicio
          </Link>
        }
      />
    </main>
  );
}
