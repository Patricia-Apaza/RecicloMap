import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { sumarDias } from '../estadisticas/fechas.js';
import { primerDiaDelMesSiguiente } from './semanas.js';

export const VENTANA_RECLAMO_DIAS = 7;

// Horas de mantenimiento que se sumaron al plazo de reclamo del mes
export async function extraReclamoHoras(db: ClienteBd, mes: string): Promise<number> {
  const r = await db.desafio.aggregate({
    where: { mes: new Date(`${mes}T00:00:00Z`) },
    _max: { reclamoExtraHoras: true },
  });
  return r._max.reclamoExtraHoras ?? 0;
}

type Valor = Array<{ n: number }>;

// Los desafíos son mensuales: se miden entre el día 1 a las 00:00 de Lima y el día 1 del mes siguiente
export async function progresoDesafio(
  db: ClienteBd,
  usuarioId: string,
  plantilla: { tipo: string; materialId: number | null },
  mes: string,
): Promise<number> {
  const desde = mes;
  const hasta = primerDiaDelMesSiguiente(mes);
  const material = plantilla.materialId;
  let filas: Valor;
  switch (plantilla.tipo) {
    case 'KG_TOTAL':
      filas = await db.$queryRaw<Valor>`
        SELECT COALESCE(sum(kg), 0)::float8 AS n FROM (
          SELECT kg_final AS kg FROM operacion
           WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'COMPLETADA'
             AND completada_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
             AND completada_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'
          UNION ALL
          SELECT kg_confirmado FROM registro_reciclaje
           WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'CONFIRMADO'
             AND resuelto_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
             AND resuelto_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'
        ) a`;
      break;
    case 'KG_MATERIAL':
      filas = await db.$queryRaw<Valor>`
        SELECT COALESCE(sum(o.kg_final), 0)::float8 AS n FROM operacion o JOIN publicacion p ON p.id = o.publicacion_id
         WHERE o.reciclador_id = ${usuarioId}::uuid AND o.estado = 'COMPLETADA' AND p.material_id = ${material}::int
           AND o.completada_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
           AND o.completada_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'`;
      break;
    case 'OPERACIONES':
      filas = await db.$queryRaw<Valor>`
        SELECT count(*)::float8 AS n FROM operacion
         WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'COMPLETADA'
           AND completada_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
           AND completada_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'`;
      break;
    case 'OPERACIONES_MATERIAL':
      filas = await db.$queryRaw<Valor>`
        SELECT count(*)::float8 AS n FROM operacion o JOIN publicacion p ON p.id = o.publicacion_id
         WHERE o.reciclador_id = ${usuarioId}::uuid AND o.estado = 'COMPLETADA' AND p.material_id = ${material}::int
           AND o.completada_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
           AND o.completada_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'`;
      break;
    case 'CALIFICACIONES':
      filas = await db.$queryRaw<Valor>`
        SELECT count(*)::float8 AS n FROM calificacion
         WHERE autor_id = ${usuarioId}::uuid
           AND creada_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
           AND creada_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'`;
      break;
    default:
      // DIAS_PUBLICANDO: días distintos con publicaciones; las canceladas no cuentan
      filas = await db.$queryRaw<Valor>`
        SELECT count(DISTINCT (creada_en AT TIME ZONE 'America/Lima')::date)::float8 AS n FROM publicacion
         WHERE reciclador_id = ${usuarioId}::uuid AND estado <> 'CANCELADA'
           AND creada_en >= (${desde}::date)::timestamp AT TIME ZONE 'America/Lima'
           AND creada_en < (${hasta}::date)::timestamp AT TIME ZONE 'America/Lima'`;
  }
  return filas[0]?.n ?? 0;
}

// Último día en que se puede reclamar un desafío del mes dado
export function limiteDeReclamo(mes: string, dias: number, extraHoras = 0): string {
  return sumarDias(primerDiaDelMesSiguiente(mes), dias - 1 + Math.ceil(extraHoras / 24));
}
