import type { ClienteBd } from '../../nucleo/base-datos/tipos.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { rachaActual, rachaMaxima } from './semanas.js';

export type Medidas = {
  kgTotal: number;
  operaciones: number;
  califProm: number;
  racha: number;
  rachaVigente: number;
  madrugador: number;
  cazadorDePrecios: number;
  embajador: number;
  materialImpecable: number;
  mesesConDesafio: number;
  giros: number;
  semilla: boolean;
};

type Conteo = Array<{ n: number }>;

// Lo que cuenta cada semana para la racha: una operación completada o una entrega directa confirmada
export async function semanasConActividad(db: ClienteBd, usuarioId: string): Promise<string[]> {
  const filas = await db.$queryRaw<Array<{ semana: string }>>`
    SELECT DISTINCT to_char(date_trunc('week', cuando AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD') AS semana
      FROM (
        SELECT completada_en AS cuando FROM operacion
         WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'COMPLETADA' AND completada_en IS NOT NULL
        UNION ALL
        SELECT resuelto_en FROM registro_reciclaje
         WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'CONFIRMADO' AND resuelto_en IS NOT NULL
      ) a`;
  return filas.map((f) => f.semana);
}

// Todo se calcula con datos reales del servidor; nada llega del cliente
export async function medir(db: ClienteBd, usuarioId: string, ahora: Date = new Date()): Promise<Medidas> {
  const perfil = await db.recicladorPerfil.findUniqueOrThrow({
    where: { usuarioId },
    select: { kgTotal: true, operacionesCompletadas: true, califProm: true },
  });
  const [semanas, madrugador, cazador, embajador, impecable, desafios, giros, usuario] = await Promise.all([
    semanasConActividad(db, usuarioId),
    db.$queryRaw<Conteo>`
      SELECT count(*)::int AS n FROM operacion
       WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'COMPLETADA' AND confirmada_en IS NOT NULL
         AND EXTRACT(HOUR FROM confirmada_en AT TIME ZONE 'America/Lima') < 9`,
    db.$queryRaw<Conteo>`
      SELECT count(*)::int AS n FROM operacion
       WHERE reciclador_id = ${usuarioId}::uuid AND estado = 'COMPLETADA' AND acepto_mayor_total AND ofertas_al_aceptar >= 2`,
    db.$queryRaw<Conteo>`
      SELECT count(*)::int AS n FROM invitacion WHERE invitador_id = ${usuarioId}::uuid AND contada_en IS NOT NULL`,
    db.$queryRaw<Conteo>`
      SELECT count(DISTINCT c.id)::int AS n
        FROM calificacion c
        JOIN calificacion_etiqueta ce ON ce.calificacion_id = c.id
        JOIN etiqueta_calificacion e ON e.id = ce.etiqueta_id
       WHERE c.destino_id = ${usuarioId}::uuid AND e.destino = 'RECICLADOR' AND e.nombre IN ('Material limpio', 'Bien separado')
         AND NOT EXISTS (SELECT 1 FROM resena_oculta ro WHERE ro.calificacion_id = c.id)`,
    db.$queryRaw<Conteo>`
      SELECT count(DISTINCT d.mes)::int AS n FROM usuario_desafio ud JOIN desafio d ON d.id = ud.desafio_id
       WHERE ud.usuario_id = ${usuarioId}::uuid AND ud.reclamado_en IS NOT NULL`,
    db.sorteoRuleta.count({ where: { usuarioId } }),
    db.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { telefonoVerificadoEn: true } }),
  ]);
  return {
    kgTotal: Number(perfil.kgTotal),
    operaciones: perfil.operacionesCompletadas,
    califProm: Number(perfil.califProm),
    racha: rachaMaxima(semanas),
    rachaVigente: rachaActual(semanas, hoyEnLima(ahora)),
    madrugador: madrugador[0]?.n ?? 0,
    cazadorDePrecios: cazador[0]?.n ?? 0,
    embajador: embajador[0]?.n ?? 0,
    materialImpecable: impecable[0]?.n ?? 0,
    mesesConDesafio: desafios[0]?.n ?? 0,
    giros,
    semilla: usuario.telefonoVerificadoEn !== null,
  };
}

type Criterio = { actual: (m: Medidas) => number; cumple: (m: Medidas, meta: number) => boolean };

const porCantidad = (campo: (m: Medidas) => number): Criterio => ({
  actual: campo,
  cumple: (m, meta) => campo(m) >= meta,
});

// Criterios fijos de las 12 insignias; el catálogo de la base solo aporta nombre, texto y meta
export const CRITERIOS: Record<string, Criterio> = {
  semilla: { actual: (m) => (m.semilla ? 1 : 0), cumple: (m) => m.semilla },
  recolector: porCantidad((m) => m.kgTotal),
  guardian: porCantidad((m) => m.kgTotal),
  maestro: porCantidad((m) => m.kgTotal),
  racha_4_semanas: porCantidad((m) => m.racha),
  madrugador: porCantidad((m) => m.madrugador),
  reciclador_confiable: {
    actual: (m) => m.operaciones,
    cumple: (m, meta) => m.operaciones >= meta && m.califProm >= 4.5,
  },
  material_impecable: porCantidad((m) => m.materialImpecable),
  cazador_de_precios: porCantidad((m) => m.cazadorDePrecios),
  embajador: porCantidad((m) => m.embajador),
  primer_giro: porCantidad((m) => m.giros),
  // Al menos un desafío reclamado en meses distintos
  cazador_de_desafios: porCantidad((m) => m.mesesConDesafio),
};
