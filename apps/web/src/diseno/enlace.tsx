'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';

// Enlace de la app: sin precarga automática de pantallas. Cada precarga es una solicitud y gasta datos del celular (3G)
// y cupo de un túnel; la pantalla se pide cuando la persona la abre. Se puede volver a activar con prefetch en un enlace concreto
export default function Enlace({ prefetch = false, ...resto }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...resto} />;
}
