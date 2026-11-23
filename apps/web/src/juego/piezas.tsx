import { Icono, type NombreIcono } from '@/diseno/icono';
import type { InsigniaJuego } from './tipos';

// Colores de los 6 niveles, tal como en el prototipo (pantallas 14, 30 y 31)
export const COLOR_NIVEL = ['#CFE3F2', '#F4E4BE', '#D9F0C9', '#E5DAF2', '#B7E36B', '#F6C9C0'];

export const ICONO_INSIGNIA: Record<string, NombreIcono> = {
  semilla: 'i-leaf',
  recolector: 'i-recycle',
  guardian: 'i-shield',
  maestro: 'i-star',
  racha_4_semanas: 'i-activity',
  madrugador: 'i-clock',
  reciclador_confiable: 'i-shield',
  material_impecable: 'i-check',
  cazador_de_precios: 'i-tick',
  embajador: 'i-user',
  primer_giro: 'i-gift',
  cazador_de_desafios: 'i-trophy',
};

export const COLOR_INSIGNIA: Record<string, string> = {
  semilla: '#D9F0C9',
  recolector: '#CFE3F2',
  guardian: '#F4E4BE',
  maestro: '#E5DAF2',
  racha_4_semanas: '#B7E36B',
  madrugador: '#F4E4BE',
  reciclador_confiable: '#D9F0C9',
  material_impecable: '#CFE3F2',
  cazador_de_precios: '#F4E4BE',
  embajador: '#E5DAF2',
  primer_giro: '#B7E36B',
  cazador_de_desafios: '#F6C9C0',
};

export const TEXTO_CATEGORIA: Record<InsigniaJuego['categoria'], string> = {
  KILOS: 'Kilos',
  CONSTANCIA: 'Constancia',
  CALIDAD: 'Calidad',
  PRECIO: 'Precio',
  COMUNIDAD: 'Comunidad',
  JUEGO: 'Juego',
};

// Hexágono del prototipo: color si está lograda y candado en gris si no
export function Hexagono({
  icono,
  color,
  lograda,
  tamano = 96,
}: {
  icono: NombreIcono;
  color: string;
  lograda: boolean;
  tamano?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 112"
      width={tamano}
      height={tamano * 1.12}
      aria-hidden="true"
      style={{ filter: lograda ? 'drop-shadow(3px 3px 0 #12301F)' : 'grayscale(1) opacity(.5)' }}
    >
      <path
        d="M50 4 94 28v56L50 108 6 84V28z"
        fill={lograda ? color : '#EFE8D6'}
        stroke="#12301F"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M50 14 85 33v46L50 98 15 79V33z"
        fill="none"
        stroke="#12301F"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        opacity=".5"
      />
      <g style={{ fill: 'none', stroke: '#12301F', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <use href={`/iconos.svg#${lograda ? icono : 'i-lock'}`} x="31" y="34" width="38" height="38" />
      </g>
    </svg>
  );
}

export function IconoNivel({ lograda, color, tamano = 48 }: { lograda: boolean; color: string; tamano?: number }) {
  return (
    <span className="mi" style={{ width: tamano, height: tamano, background: lograda ? color : '#EFE8D6' }}>
      <Icono nombre={lograda ? 'i-leaf' : 'i-lock'} />
    </span>
  );
}

export const kg = (valor: number) => valor.toLocaleString('es-PE', { maximumFractionDigits: 2 });

// Vencimiento futuro en lenguaje simple
export function textoVence(fecha: string): string {
  const dias = Math.ceil((new Date(fecha).getTime() - Date.now()) / 86_400_000);
  if (dias <= 0) return 'Vence hoy';
  return dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`;
}
