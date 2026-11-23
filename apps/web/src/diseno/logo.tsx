import Link from '@/diseno/enlace';

export function LogoMarca({ tamano = 32 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={Math.round(tamano * 1.1)} viewBox="0 0 40 44" aria-hidden="true" focusable="false">
      <path d="M20 42S5 29 5 17a15 15 0 0130 0c0 12-15 25-15 25z" fill="#2F9B66" stroke="#12301F" strokeWidth="2" />
      <path d="M12 25c0-9 5-14 16-14 0 10-5 15-16 14z" fill="#F6F1E4" />
      <path d="M13 24c4-5 8-8 12-10" stroke="#12301F" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Marca({ href }: { href: string }) {
  return (
    <Link className="brand" href={href} aria-label="RecicloMap, inicio">
      <LogoMarca />
      <span>
        Reciclo<em>Map</em>
      </span>
    </Link>
  );
}
