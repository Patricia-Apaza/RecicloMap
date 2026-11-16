export type Muestra = { nombre: string; hex: string; token: string; uso: string };

export const PALETA: Muestra[] = [
  { nombre: 'Papel crema', hex: '#F6F1E4', token: '--color-paper', uso: 'Fondo de toda la app' },
  { nombre: 'Papel 2', hex: '#EFE8D6', token: '--color-paper2', uso: 'Hover y bloques de apoyo' },
  { nombre: 'Tinta', hex: '#12301F', token: '--color-ink', uso: 'Texto fuerte, bordes de 2 px' },
  { nombre: 'Texto', hex: '#3F4F46', token: '--color-text', uso: 'Párrafos' },
  { nombre: 'Secundario', hex: '#5E6E65', token: '--color-muted', uso: 'Texto de apoyo' },
  { nombre: 'Verde', hex: '#2F9B66', token: '--color-g', uso: 'Acentos y líneas' },
  { nombre: 'Verde botón', hex: '#1E8A57', token: '--color-btn', uso: 'Botón principal' },
  { nombre: 'Verde botón oscuro', hex: '#176E45', token: '--color-btn-d', uso: 'Variante oscura del botón' },
  { nombre: 'Verde profundo', hex: '#1F5A48', token: '--color-deep', uso: 'Kickers y enlaces' },
  { nombre: 'Bosque', hex: '#0F3D2A', token: '--color-forest', uso: 'Bloques oscuros' },
  { nombre: 'Lima', hex: '#B7E36B', token: '--color-lime', uso: 'Marcador de títulos, selección' },
  { nombre: 'Menta', hex: '#D9F0C9', token: '--color-mint', uso: 'Pastel · éxito' },
  { nombre: 'Cielo', hex: '#CFE3F2', token: '--color-sky', uso: 'Pastel · información' },
  { nombre: 'Arena', hex: '#F4E4BE', token: '--color-sand', uso: 'Pastel · atención' },
  { nombre: 'Lila', hex: '#E5DAF2', token: '--color-lilac', uso: 'Pastel · admin y premios' },
];

export const ESTADOS: Muestra[] = [
  { nombre: 'Mejor / abierto', hex: '#DDF0E3', token: '--color-mejor', uso: 'Texto #19694A (--color-ok)' },
  { nombre: 'Intermedio / atención', hex: '#FBEFCF', token: '--color-intermedio', uso: 'Texto #8A5A00 (--color-warn)' },
  { nombre: 'Bajo / cerrado', hex: '#F8DEDA', token: '--color-bajo', uso: 'Texto #9A2C21 (--color-bad)' },
  { nombre: 'Sin comparación', hex: '#E9E3D1', token: '--color-neutro', uso: 'Texto #4A5A50 (--color-neutro-texto)' },
  { nombre: 'Demanda / info', hex: '#DCE8F7', token: '--color-info', uso: 'Texto #1D3FA8 (--color-info-texto)' },
  { nombre: 'Demanda', hex: '#2457B5', token: '--color-dem', uso: 'Barras activas; apagadas #C5D5EF' },
  { nombre: 'Peligro', hex: '#A83226', token: '--color-peligro', uso: 'Botón de peligro y error de campo' },
  { nombre: 'Estrella', hex: '#E3A912', token: '--color-estrella', uso: 'Calificación; vacía #C9C3B0' },
  { nombre: 'Foco', hex: '#6FB0FF', token: '--color-foco', uso: 'Contorno de foco del teclado' },
  { nombre: 'Deshabilitado', hex: '#E8E3D3', token: '--color-apagado', uso: 'Texto #8A8F86' },
];
