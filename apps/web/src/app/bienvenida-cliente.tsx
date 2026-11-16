'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { rutaDelPaso } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

// Entra al mapa sin cuenta: solo puede mirar
export function BotonInvitado({ className }: { className: string }) {
  const router = useRouter();
  const { entrarComoInvitado } = useSesion();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        entrarComoInvitado();
        router.push(RUTAS.mapa);
      }}
    >
      <Icono nombre="i-eye" tamano="sm" />
      Continuar como invitado
    </button>
  );
}

// Con sesión abierta, la portada ofrece volver a la cuenta en lugar de registrarse
export function AccionesPortada({ claseBlanco, clasePrincipal }: { claseBlanco: string; clasePrincipal: string }) {
  const { cargando, usuario } = useSesion();
  if (!cargando && usuario) {
    return (
      <Link className={clasePrincipal} href={rutaDelPaso(usuario)}>
        Ir a mi cuenta
        <Icono nombre="i-arrow-right" tamano="sm" />
      </Link>
    );
  }
  return (
    <>
      <Link className={claseBlanco} href={RUTAS.iniciarSesion}>
        Iniciar sesión
      </Link>
      <a className={clasePrincipal} href="#roles">
        Crear cuenta
      </a>
    </>
  );
}

// Agrega la clase "in" cuando cada bloque entra en pantalla, como en el prototipo
export function Revelar({ children }: { children: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elementos = raiz.current?.querySelectorAll<HTMLElement>('[data-revela]') ?? [];
    if (!('IntersectionObserver' in window)) {
      elementos.forEach((elemento) => elemento.classList.add('in'));
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add('in');
          observador.unobserve(entrada.target);
        }),
      { threshold: 0.18 },
    );
    elementos.forEach((elemento) => observador.observe(elemento));
    return () => observador.disconnect();
  }, []);
  return <div ref={raiz}>{children}</div>;
}

// Cuenta desde cero hasta la cifra cuando aparece; el valor real ya está en el HTML
export function Contador({ valor, decimales = 0 }: { valor: number; decimales?: number }) {
  const final = valor.toFixed(decimales).replace('.', ',');
  const [texto, setTexto] = useState(final);
  const elemento = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nodo = elemento.current;
    if (!nodo || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    let cuadro = 0;
    const observador = new IntersectionObserver(([entrada]) => {
      if (!entrada?.isIntersecting) return;
      observador.disconnect();
      let inicio: number | null = null;
      const paso = (tiempo: number) => {
        inicio ??= tiempo;
        const avance = Math.min((tiempo - inicio) / 1500, 1);
        setTexto((valor * (1 - Math.pow(1 - avance, 3))).toFixed(decimales).replace('.', ','));
        if (avance < 1) cuadro = requestAnimationFrame(paso);
      };
      cuadro = requestAnimationFrame(paso);
    });
    observador.observe(nodo);
    return () => {
      observador.disconnect();
      cancelAnimationFrame(cuadro);
    };
  }, [valor, decimales]);
  return (
    <span ref={elemento} aria-label={final}>
      {texto}
    </span>
  );
}
