import { type NextRequest, NextResponse } from 'next/server';

// La web y la API comparten origen: así la cookie de sesión es del propio sitio. La dirección se lee al arrancar
export function proxy(solicitud: NextRequest) {
  const destino = new URL(
    solicitud.nextUrl.pathname + solicitud.nextUrl.search,
    process.env.API_URL_INTERNA ?? 'http://localhost:3001',
  );
  return NextResponse.rewrite(destino);
}

export const config = { matcher: '/api/v1/:ruta*' };
