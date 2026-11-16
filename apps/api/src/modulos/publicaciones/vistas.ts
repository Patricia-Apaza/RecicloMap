import type { Prisma } from '../../generado/prisma/client.js';

type Decimalish = { toNumber(): number } | number;
const numero = (valor: Decimalish) => (typeof valor === 'number' ? valor : valor.toNumber());

// RN-09: con menos de 3 calificaciones se muestra "Nuevo" en vez de un promedio
export function calificacionPublica(promedio: Decimalish, cantidad: number) {
  const nuevo = cantidad < 3;
  return { promedio: nuevo ? null : numero(promedio).toFixed(1), cantidad, nuevo };
}

// Mismo criterio que la vista del mapa: Pro solo dentro de su periodo, en hora de Lima
export function esProVigente(negocio: { plan: string; planDesde: Date | null; planHasta: Date | null }): boolean {
  if (negocio.plan !== 'PRO' || !negocio.planDesde || !negocio.planHasta) return false;
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);
  return dia(negocio.planDesde) <= hoy && hoy <= dia(negocio.planHasta);
}

// Lo que un negocio sabe del reciclador antes de aceptar (S1): nunca nombre, barrio, coordenadas ni distancia numérica
export const seleccionRecicladorPublico = {
  telefonoVerificadoEn: true,
  ciudad: { select: { nombre: true } },
  perfilReciclador: {
    select: {
      operacionesCompletadas: true,
      califProm: true,
      califCant: true,
      nivel: { select: { id: true, nombre: true } },
    },
  },
} satisfies Prisma.UsuarioSelect;

type RecicladorPublico = Prisma.UsuarioGetPayload<{ select: typeof seleccionRecicladorPublico }>;

// RN-10: "Reciclador Confiable" con promedio de 4,5 o más y al menos 10 operaciones completadas
export function recicladorPublico(fila: RecicladorPublico) {
  const perfil = fila.perfilReciclador;
  const promedio = perfil ? numero(perfil.califProm) : 0;
  const operaciones = perfil?.operacionesCompletadas ?? 0;
  return {
    alias: 'Reciclador',
    ciudad: fila.ciudad.nombre,
    nivel: perfil ? { numero: perfil.nivel.id, nombre: perfil.nivel.nombre } : { numero: 1, nombre: 'Semilla' },
    calificacion: calificacionPublica(promedio, perfil?.califCant ?? 0),
    operaciones,
    confiable: promedio >= 4.5 && operaciones >= 10,
    telefonoVerificado: fila.telefonoVerificadoEn !== null,
  };
}
