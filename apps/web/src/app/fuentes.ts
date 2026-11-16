import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from 'next/font/google';

// Se descargan al compilar y se sirven desde el propio dominio, solo con caracteres latinos

// Variable con tamaño óptico, como en el prototipo: los títulos grandes usan un dibujo más ajustado
export const fuenteTitulos = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--fuente-titulos',
});

export const fuenteCuerpo = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--fuente-cuerpo',
});

export const fuenteDatos = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--fuente-datos',
});
