import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ProveedorAvisos } from '@/diseno/avisos';
import { AvisoConexion } from '@/pwa/aviso-conexion';
import { AvisosDePlataforma } from '@/plataforma/estado-plataforma';
import { RegistrarServiceWorker } from '@/pwa/registrar-service-worker';
import { ProveedorSesion } from '@/sesion/sesion';
import { fuenteCuerpo, fuenteDatos, fuenteTitulos } from './fuentes';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'RecicloMap', template: '%s · RecicloMap' },
  description: 'Sabe quién compra tu material, cuánto paga y dónde. Juliaca, Puno.',
  applicationName: 'RecicloMap',
  appleWebApp: { capable: true, title: 'RecicloMap', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#F6F1E4',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE" className={`${fuenteTitulos.variable} ${fuenteCuerpo.variable} ${fuenteDatos.variable}`}>
      <body>
        <ProveedorSesion>
          <ProveedorAvisos>
            <AvisoConexion />
            <AvisosDePlataforma />
            {children}
          </ProveedorAvisos>
        </ProveedorSesion>
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
