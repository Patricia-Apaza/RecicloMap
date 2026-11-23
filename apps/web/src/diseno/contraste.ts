function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255);
  const [r, g, b] = canales.map((valor) => (valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razón de contraste de WCAG 2.x entre dos colores hexadecimales
export function razonContraste(colorA: string, colorB: string): number {
  const a = luminancia(colorA);
  const b = luminancia(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type ParColor = { texto: string; colorTexto: string; fondo: string; colorFondo: string; uso: string };

// Pares de texto y fondo que usa la web; el botón principal y el texto sobre pastel ya usan los colores aprobados
export const PARES_PROTOTIPO: ParColor[] = [
  { texto: 'texto', colorTexto: '#3F4F46', fondo: 'papel', colorFondo: '#F6F1E4', uso: 'Párrafos' },
  { texto: 'tinta', colorTexto: '#12301F', fondo: 'papel', colorFondo: '#F6F1E4', uso: 'Títulos' },
  { texto: 'secundario', colorTexto: '#5E6E65', fondo: 'papel', colorFondo: '#F6F1E4', uso: 'Texto de apoyo' },
  {
    texto: 'secundario',
    colorTexto: '#5E6E65',
    fondo: 'blanco',
    colorFondo: '#FFFFFF',
    uso: 'Texto de apoyo en paneles',
  },
  {
    texto: 'secundario',
    colorTexto: '#5E6E65',
    fondo: 'hoja',
    colorFondo: '#FFFDF7',
    uso: 'Texto de apoyo en ventanas',
  },
  {
    texto: 'texto',
    colorTexto: '#3F4F46',
    fondo: 'papel 2',
    colorFondo: '#EFE8D6',
    uso: 'Texto de apoyo sobre bloques',
  },
  { texto: 'texto', colorTexto: '#3F4F46', fondo: 'arena', colorFondo: '#F4E4BE', uso: 'Texto de apoyo en KPI' },
  { texto: 'texto', colorTexto: '#3F4F46', fondo: 'menta', colorFondo: '#D9F0C9', uso: 'Texto de apoyo en KPI' },
  { texto: 'texto', colorTexto: '#3F4F46', fondo: 'cielo', colorFondo: '#CFE3F2', uso: 'Texto de apoyo en KPI' },
  { texto: 'texto', colorTexto: '#3F4F46', fondo: 'lila', colorFondo: '#E5DAF2', uso: 'Texto de apoyo en KPI' },
  { texto: 'profundo', colorTexto: '#1F5A48', fondo: 'papel', colorFondo: '#F6F1E4', uso: 'Antetítulos y enlaces' },
  { texto: 'profundo', colorTexto: '#1F5A48', fondo: 'cielo', colorFondo: '#CFE3F2', uso: 'Etiqueta de KPI' },
  { texto: 'tinta', colorTexto: '#12301F', fondo: 'lima', colorFondo: '#B7E36B', uso: 'Chip de puntos' },
  {
    texto: 'blanco',
    colorTexto: '#FFFFFF',
    fondo: 'verde botón oscuro',
    colorFondo: '#176E45',
    uso: 'Botón principal',
  },
  { texto: 'blanco', colorTexto: '#FFFFFF', fondo: 'peligro', colorFondo: '#A83226', uso: 'Botón de peligro' },
  {
    texto: 'blanco',
    colorTexto: '#FFFFFF',
    fondo: 'tinta',
    colorFondo: '#12301F',
    uso: 'Botón oscuro y aviso flotante',
  },
  { texto: 'lima', colorTexto: '#B7E36B', fondo: 'tinta', colorFondo: '#12301F', uso: 'Píldora Pro' },
  { texto: 'éxito', colorTexto: '#19694A', fondo: 'mejor', colorFondo: '#DDF0E3', uso: 'Semáforo: Mejor precio' },
  {
    texto: 'atención',
    colorTexto: '#8A5A00',
    fondo: 'intermedio',
    colorFondo: '#FBEFCF',
    uso: 'Semáforo: Precio intermedio',
  },
  { texto: 'error', colorTexto: '#9A2C21', fondo: 'bajo', colorFondo: '#F8DEDA', uso: 'Semáforo: Precio bajo' },
  { texto: 'neutro', colorTexto: '#4A5A50', fondo: 'neutro', colorFondo: '#E9E3D1', uso: 'Semáforo: Sin comparación' },
  { texto: 'info', colorTexto: '#1D3FA8', fondo: 'info', colorFondo: '#DCE8F7', uso: 'Píldora informativa' },
  { texto: 'demanda', colorTexto: '#2457B5', fondo: 'blanco', colorFondo: '#FFFFFF', uso: 'Texto de demanda' },
  { texto: 'demanda', colorTexto: '#2457B5', fondo: 'papel', colorFondo: '#F6F1E4', uso: 'Texto de demanda' },
  { texto: 'peligro', colorTexto: '#A83226', fondo: 'campo con error', colorFondo: '#FFF7F4', uso: 'Mensaje de error' },
  { texto: 'nota oscura', colorTexto: '#E6F2EA', fondo: 'bosque', colorFondo: '#0F3D2A', uso: 'Nota en panel oscuro' },
];

// Pares del prototipo por debajo de AA que siguen sin corregir (ninguno tras las decisiones de la Fase 3B)
export const PARES_REPORTADOS: Array<{ texto: string; fondo: string }> = [];
