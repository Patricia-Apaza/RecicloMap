import type { NuevaNotificacion } from '../notificaciones/notificaciones.service.js';

// Textos de la pantalla 32 (Fase 1) con el material real en el título (A4)
const soles = (valor: number | string) => Number(valor).toFixed(2);
const kilos = (valor: number | string) => Number(valor).toLocaleString('es-PE', { maximumFractionDigits: 2 });

type Base = { usuarioId: string; material: string; kg: number | string };

export const RUTA_OFERTAS_RECIBIDAS = (publicacionId: string) => `/ofertas?publicacion=${publicacionId}`;
export const RUTA_PUBLICACION_CERCANA = (publicacionId: string) => `/negocio/publicaciones/${publicacionId}`;
export const RUTA_OPERACION = (operacionId: string) => `/operaciones/${operacionId}`;
export const RUTA_OFERTAS_ENVIADAS = '/negocio/ofertas';
export const RUTA_MIS_PUBLICACIONES = '/publicaciones';

// "Rosa M.": nombre y la inicial del apellido, como en las reseñas
export function nombreCorto(nombre: string): string {
  const [primero = '', segundo] = nombre.trim().split(/\s+/);
  return segundo ? `${primero} ${segundo.charAt(0).toUpperCase()}.` : primero;
}

export const avisos = {
  nuevaOferta: (
    d: Base & { publicacionId: string; negocio: string; precioKg: number | string },
  ): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'OFERTA',
    titulo: `Nueva oferta por tu ${d.material}`,
    mensaje: `${d.negocio} ofrece S/ ${soles(d.precioKg)} por kg por tus ${kilos(d.kg)} kg.`,
    enlace: RUTA_OFERTAS_RECIBIDAS(d.publicacionId),
  }),
  ofertaModificada: (
    d: Base & { publicacionId: string; negocio: string; precioKg: number | string },
  ): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'OFERTA',
    titulo: `Cambió una oferta por tu ${d.material}`,
    mensaje: `${d.negocio} cambió su oferta a S/ ${soles(d.precioKg)} por kg.`,
    enlace: RUTA_OFERTAS_RECIBIDAS(d.publicacionId),
  }),
  ofertaAceptada: (
    d: Base & { operacionId: string; reciclador: string; precioKg: number | string },
  ): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'ACEPTACION',
    titulo: `Aceptaron tu oferta por ${d.material}`,
    mensaje: `${d.reciclador} aceptó tu oferta de S/ ${soles(d.precioKg)} por kg por ${kilos(d.kg)} kg de ${d.material}.`,
    enlace: RUTA_OPERACION(d.operacionId),
    obligatoria: true,
  }),
  ofertaNoSeleccionada: (d: Base): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'ACEPTACION',
    titulo: `Tu oferta por ${d.material} no fue seleccionada`,
    mensaje: `Tu oferta por ${kilos(d.kg)} kg de ${d.material} no fue seleccionada.`,
    enlace: RUTA_OFERTAS_ENVIADAS,
  }),
  publicacionNoDisponible: (d: Base): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'ACEPTACION',
    titulo: `La publicación de ${d.material} ya no está disponible`,
    mensaje: `La publicación de ${kilos(d.kg)} kg de ${d.material} ya no está disponible.`,
    enlace: RUTA_OFERTAS_ENVIADAS,
  }),
  porVencer: (d: Base & { publicacionId: string }): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'AVISO',
    titulo: `Tu publicación de ${d.material} vence pronto`,
    mensaje: `Tu ${d.material} de ${kilos(d.kg)} kg vence en 2 días. Renuévala si aún lo tienes.`,
    enlace: `/publicaciones/${d.publicacionId}`,
    // Aviso sobre lo propio: no se apaga con la preferencia de "Avisos"
    obligatoria: true,
  }),
  nuevaCerca: (d: Base & { publicacionId: string; tramo: string; esCentro: boolean }): NuevaNotificacion => ({
    usuarioId: d.usuarioId,
    tipo: 'AVISO',
    titulo: `Nueva publicación de ${d.material} cerca`,
    mensaje: `${kilos(d.kg)} kg de ${d.material} a ${d.tramo} de ${d.esCentro ? 'tu local' : 'tu zona de trabajo'}.`,
    enlace: RUTA_PUBLICACION_CERCANA(d.publicacionId),
  }),
};
