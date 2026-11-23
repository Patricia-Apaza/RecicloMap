import path from 'node:path';
import { config as cargarEnv } from 'dotenv';
import type { NextConfig } from 'next';

// La web también lee el .env de la raíz (el ID de cliente de Google, el servidor de teselas, la dirección de la API). Lo ya definido en el sistema manda
cargarEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const produccion = process.env.NODE_ENV === 'production';
const GOOGLE = 'https://maps.googleapis.com https://accounts.google.com https://apis.google.com';
// Teselas del mapa: OpenStreetMap por defecto y MapTiler si se elige; un servidor propio se agrega con MAPA_IMG_ORIGENES al compilar
const TESELAS = [
  'https://tile.openstreetmap.org',
  'https://api.maptiler.com',
  ...(process.env.MAPA_IMG_ORIGENES ?? '').split(/\s+/).filter((origen) => /^https?:\/\/[^\s;'"]+$/.test(origen)),
].join(' ');

// Solo se permite cargar lo que la app usa de verdad: las teselas del mapa, Google (si se elige) e inicio de sesión de Google. Los scripts en línea los exige Next
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${produccion ? '' : " 'unsafe-eval'"} ${GOOGLE}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  `img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com ${TESELAS}`,
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${GOOGLE} https://*.googleapis.com`,
  'frame-src https://accounts.google.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const configuracion: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Los sondeos largos de los avisos en vivo duran hasta 55 s: el reenvío a la API debe esperarlos
  experimental: { proxyTimeout: 75_000 },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          ...(produccion ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default configuracion;
