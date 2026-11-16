import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clases } from './clases';

export type VarianteBoton = 'principal' | 'secundario' | 'fantasma' | 'peligro' | 'oscuro';

const CLASE_VARIANTE: Record<VarianteBoton, string | undefined> = {
  principal: 'p',
  secundario: undefined,
  fantasma: 'ghost',
  peligro: 'dn',
  oscuro: 'dk',
};

type Comunes = {
  variante?: VarianteBoton;
  pequeno?: boolean;
  children: ReactNode;
  className?: string;
};

export function claseBoton({ variante = 'secundario', pequeno, className }: Omit<Comunes, 'children'>): string {
  return clases('btn', CLASE_VARIANTE[variante], pequeno && 'sm', className);
}

export function Boton({
  variante,
  pequeno,
  className,
  children,
  type = 'button',
  ...resto
}: Comunes & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={claseBoton({ variante, pequeno, className })} {...resto}>
      {children}
    </button>
  );
}

export function BotonEnlace({ variante, pequeno, className, children, href }: Comunes & { href: string }) {
  return (
    <Link href={href} className={claseBoton({ variante, pequeno, className })}>
      {children}
    </Link>
  );
}
