import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RecicloMap',
    short_name: 'RecicloMap',
    description: 'Sabe quién compra tu material, cuánto paga y dónde.',
    lang: 'es-PE',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F1E4',
    theme_color: '#F6F1E4',
    categories: ['business', 'utilities'],
    icons: [
      { src: '/iconos/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/512-adaptable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
