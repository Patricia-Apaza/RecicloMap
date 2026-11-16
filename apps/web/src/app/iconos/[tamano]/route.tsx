import { iconoApp } from '@/pwa/icono-app';

const TAMANOS: Record<string, { lado: number; adaptable: boolean }> = {
  '192': { lado: 192, adaptable: false },
  '512': { lado: 512, adaptable: false },
  '512-adaptable': { lado: 512, adaptable: true },
};

export const dynamicParams = false;

export function generateStaticParams(): Array<{ tamano: string }> {
  return Object.keys(TAMANOS).map((tamano) => ({ tamano }));
}

export async function GET(_solicitud: Request, { params }: { params: Promise<{ tamano: string }> }) {
  const { tamano } = await params;
  const icono = TAMANOS[tamano];
  if (!icono) {
    return new Response(null, { status: 404 });
  }
  return iconoApp(icono.lado, icono.adaptable);
}
