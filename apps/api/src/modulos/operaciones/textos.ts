import type { NuevaNotificacion } from '../notificaciones/notificaciones.service.js';
import { RUTA_OPERACION } from '../publicaciones/textos.js';

// Textos de la Fase 1 (sección 4) con el material real; los avisos de una operación propia no se pueden apagar
const kilos = (valor: number | string) => Number(valor).toLocaleString('es-PE', { maximumFractionDigits: 2 });

type Base = { usuarioId: string; operacionId: string; material: string; kg: number | string };
const base = (d: Base, tipo: NuevaNotificacion['tipo'], titulo: string, mensaje: string): NuevaNotificacion => ({
  usuarioId: d.usuarioId,
  tipo,
  titulo: titulo.slice(0, 80),
  mensaje: mensaje.slice(0, 200),
  enlace: RUTA_OPERACION(d.operacionId),
  obligatoria: true,
});

export const avisosOperacion = {
  puntoDefinido: (d: Base & { reciclador: string }) =>
    base(
      d,
      'OPERACION',
      `Punto de encuentro para tu ${d.material}`,
      `${d.reciclador} propuso el punto de encuentro para ${kilos(d.kg)} kg de ${d.material}.`,
    ),
  entregado: (d: Base) =>
    base(
      d,
      'OPERACION',
      `El reciclador marcó la entrega de ${d.material}`,
      `Confirma la recepción de ${kilos(d.kg)} kg de ${d.material} e indica los kilos recibidos.`,
    ),
  recepcionConfirmada: (d: Base & { negocio: string }) =>
    base(
      d,
      'CONFIRMACION',
      `Recepción confirmada: ${d.material}`,
      `${d.negocio} confirmó ${kilos(d.kg)} kg. Revisa y da tu conformidad.`,
    ),
  completadaReciclador: (d: Base & { puntos: number }) =>
    base(
      d,
      'CONFIRMACION',
      `Operación completada: ${d.material}`,
      `Se cerró tu entrega de ${kilos(d.kg)} kg de ${d.material}: +${d.puntos} puntos.`,
    ),
  completadaNegocio: (d: Base) =>
    base(
      d,
      'CONFIRMACION',
      `Operación completada: ${d.material}`,
      `Se cerró tu compra de ${kilos(d.kg)} kg de ${d.material}.`,
    ),
  completadaPorPlazo: (d: Base) =>
    base(
      d,
      'CONFIRMACION',
      `Operación completada: ${d.material}`,
      `La operación de ${kilos(d.kg)} kg de ${d.material} se completó al cumplirse 72 horas.`,
    ),
  noConforme: (d: Base & { reciclador: string }) =>
    base(
      d,
      'OPERACION',
      `Incidencia en tu compra de ${d.material}`,
      `${d.reciclador} no está conforme con los kilos confirmados. Un administrador lo revisará.`,
    ),
  sinConfirmar: (d: Base) =>
    base(
      d,
      'OPERACION',
      `Entrega de ${d.material} sin confirmar`,
      `Han pasado 72 horas sin confirmar la recepción de ${kilos(d.kg)} kg de ${d.material}.`,
    ),
  incidenciaAbierta: (d: Base) =>
    base(
      d,
      'OPERACION',
      `Incidencia en la entrega de ${d.material}`,
      `El reciclador abrió una incidencia por la entrega de ${kilos(d.kg)} kg de ${d.material}. Un administrador lo revisará.`,
    ),
  cancelada: (d: Base & { motivo: string }) =>
    base(
      d,
      'OPERACION',
      `Operación cancelada: ${d.material}`,
      `Se canceló la operación de ${kilos(d.kg)} kg de ${d.material}. Motivo: ${d.motivo}.`,
    ),
  correccionPedida: (d: Base & { motivo: string }) =>
    base(
      d,
      'OPERACION',
      `Revisa los kilos de ${d.material}`,
      `Un administrador pidió corregir los kilos de ${d.material}: ${d.motivo}`,
    ),
  resuelta: (d: Base & { resultado: string }) =>
    base(d, 'OPERACION', `Revisamos la incidencia de ${d.material}`, `Revisamos tu incidencia: ${d.resultado}`),
};
