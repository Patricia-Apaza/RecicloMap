import type { Prisma } from '../../generado/prisma/client.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

export type ResultadoCierre = {
  operacionId: string;
  recicladorId: string;
  negocioUsuarioId: string;
  material: string;
  kg: number;
  puntos: number;
  girosNuevos: number;
  nivel: { id: number; nombre: string; subio: boolean };
  kgTotal: number;
};

export async function parametro(tx: Prisma.TransactionClient, clave: string, defecto: number): Promise<number> {
  const fila = await tx.parametro.findUnique({ where: { clave }, select: { valor: true } });
  const valor = Number(fila?.valor);
  return Number.isFinite(valor) && valor > 0 ? valor : defecto;
}

// Un giro por cada múltiplo de 500 puntos por reciclaje que se cruza; la pantalla de giros llega en la Fase 10B
export async function otorgarGiros(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  puntosAntes: number,
  puntosDespues: number,
  puntosPorGiro: number,
  ahora: Date,
): Promise<number> {
  const antes = Math.floor(puntosAntes / puntosPorGiro);
  const despues = Math.floor(puntosDespues / puntosPorGiro);
  for (let numero = antes + 1; numero <= despues; numero++) {
    await tx.giro.create({ data: { usuarioId, origen: 'PUNTOS', numero, creadoEn: ahora } });
  }
  return Math.max(0, despues - antes);
}

// Efectos de COMPLETADA en una sola transacción (arquitectura 4, sección 1.3)
export async function completarOperacion(
  tx: Prisma.TransactionClient,
  operacionId: string,
  opciones: { porPlazo: boolean; ahora?: Date },
): Promise<ResultadoCierre> {
  const ahora = opciones.ahora ?? new Date();
  const [fila] = await tx.$queryRaw<
    Array<{
      estado: string;
      kg_final: string | null;
      reciclador_id: string;
      publicacion_id: string;
      comprador_id: string;
    }>
  >`SELECT estado::text, kg_final::text, reciclador_id, publicacion_id, comprador_id
      FROM operacion WHERE id = ${operacionId}::uuid FOR UPDATE`;
  if (!fila) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa operación.', 404);
  if (fila.estado !== 'CONFIRMADA' || fila.kg_final === null) {
    throw new ErrorNegocio('OPERACION_NO_CONFIRMADA', 'Esta operación ya no se puede completar.', 409);
  }
  const kg = Number(fila.kg_final);
  const puntosPorKg = await parametro(tx, 'puntos_por_kg', 1);
  const puntosPorGiro = await parametro(tx, 'puntos_por_giro', 500);
  const puntos = Math.floor(kg * puntosPorKg);

  await tx.operacion.update({
    where: { id: operacionId },
    data: { estado: 'COMPLETADA', enDisputa: false, completadaEn: ahora, completadaPorPlazo: opciones.porPlazo },
  });
  await tx.publicacion.update({ where: { id: fila.publicacion_id }, data: { estado: 'FINALIZADA' } });

  // Un único movimiento por operación: la restricción única es la última barrera ante un doble cierre
  await tx.movimientoPuntos.create({
    data: {
      usuarioId: fila.reciclador_id,
      puntos,
      motivo: 'OPERACION',
      cuentaParaGiros: true,
      operacionId,
      creadoEn: ahora,
    },
  });

  const perfil = await tx.recicladorPerfil.findUniqueOrThrow({
    where: { usuarioId: fila.reciclador_id },
    select: { kgTotal: true, puntosReciclaje: true, nivelId: true },
  });
  const kgTotal = Number(perfil.kgTotal) + kg;
  const nivel = await tx.nivel.findFirstOrThrow({
    where: { kgMin: { lte: kgTotal } },
    orderBy: { kgMin: 'desc' },
    select: { id: true, nombre: true },
  });
  await tx.recicladorPerfil.update({
    where: { usuarioId: fila.reciclador_id },
    data: {
      kgTotal: { increment: kg },
      puntos: { increment: puntos },
      puntosReciclaje: { increment: puntos },
      operacionesCompletadas: { increment: 1 },
      nivelId: nivel.id,
    },
  });

  const girosNuevos = await otorgarGiros(
    tx,
    fila.reciclador_id,
    perfil.puntosReciclaje,
    perfil.puntosReciclaje + puntos,
    puntosPorGiro,
    ahora,
  );

  const contexto = await tx.operacion.findUniqueOrThrow({
    where: { id: operacionId },
    select: {
      aceptoMayorTotal: true,
      comprador: { select: { usuarioId: true } },
      publicacion: { select: { material: { select: { nombre: true, codigo: true } } } },
    },
  });
  // Insignias, desafíos y estadísticas se evalúan desde este evento (Fase 10), también hacia atrás
  await tx.eventoDominio.create({
    data: {
      tipo: 'OPERACION_COMPLETADA',
      entidad: 'operacion',
      entidadId: operacionId,
      creadoEn: ahora,
      datos: {
        recicladorId: fila.reciclador_id,
        compradorId: fila.comprador_id,
        material: contexto.publicacion.material.codigo,
        kg,
        puntos,
        porPlazo: opciones.porPlazo,
        aceptoMayorTotal: contexto.aceptoMayorTotal,
      },
    },
  });

  return {
    operacionId,
    recicladorId: fila.reciclador_id,
    negocioUsuarioId: contexto.comprador.usuarioId,
    material: contexto.publicacion.material.nombre,
    kg,
    puntos,
    girosNuevos,
    kgTotal,
    nivel: { ...nivel, subio: nivel.id !== perfil.nivelId },
  };
}
