-- Fase 14: el plazo de reclamo de desafíos también se corre durante el mantenimiento (el cambio de mes y el plan Pro no)
ALTER TABLE "desafio" ADD COLUMN "reclamo_extra_horas" INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION "extender_plazos_mantenimiento"() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_dur interval;
  v_horas integer;
  v_total integer := 0;
  v_dias integer;
BEGIN
  PERFORM set_config('rm.extendiendo_plazos', '1', true);
  SELECT coalesce((SELECT "valor"::integer FROM "parametro" WHERE "clave" = 'desafio_reclamo_dias'), 7) INTO v_dias;
  FOR r IN SELECT "id", "desde", "hasta" FROM "mantenimiento_intervalo"
            WHERE "hasta" IS NOT NULL AND "extendido_en" IS NULL ORDER BY "desde" FOR UPDATE SKIP LOCKED LOOP
    v_dur := r."hasta" - r."desde";
    v_horas := ceil(extract(epoch FROM v_dur) / 3600.0)::integer;
    UPDATE "operacion" SET "plazo_conformidad_horas" = "plazo_conformidad_horas" + v_horas
     WHERE "estado" = 'CONFIRMADA' AND NOT "en_disputa" AND "plazo_conformidad_horas" IS NOT NULL;
    UPDATE "operacion" SET "plazo_aviso_entrega_horas" = "plazo_aviso_entrega_horas" + v_horas
     WHERE "estado" = 'ENTREGADA' AND "plazo_aviso_entrega_horas" IS NOT NULL;
    UPDATE "publicacion" SET "vence_en" = "vence_en" + v_dur
     WHERE "estado" IN ('DISPONIBLE', 'CON_OFERTAS') AND "vence_en" > r."desde";
    UPDATE "premio_ganado" SET "vence_en" = "vence_en" + v_dur
     WHERE "estado" = 'POR_RECLAMAR' AND "vence_en" > r."desde";
    UPDATE "registro_reciclaje" SET "vence_en" = "vence_en" + v_dur
     WHERE "estado" = 'PENDIENTE' AND "vence_en" > r."desde";
    UPDATE "reporte" SET "plazo_hasta" = "plazo_hasta" + v_dur
     WHERE "estado" = 'CORRECCION_PEDIDA' AND "plazo_hasta" > r."desde";
    UPDATE "moderacion_precio" SET "plazo_hasta" = "plazo_hasta" + v_dur
     WHERE "cerrada_en" IS NULL AND "plazo_hasta" > r."desde";
    UPDATE "usuario" SET "eliminacion_programada_en" = "eliminacion_programada_en" + v_dur
     WHERE "estado" = 'EN_ELIMINACION' AND "eliminacion_programada_en" > r."desde";
    UPDATE "desafio" SET "reclamo_extra_horas" = "reclamo_extra_horas" + ceil(extract(epoch FROM (
        least(r."hasta", ((("mes" + interval '1 month')::date + v_dias)::timestamp AT TIME ZONE 'America/Lima') + "reclamo_extra_horas" * interval '1 hour')
        - greatest(r."desde", ("mes" + interval '1 month')::timestamp AT TIME ZONE 'America/Lima'))) / 3600.0)::integer
     WHERE least(r."hasta", ((("mes" + interval '1 month')::date + v_dias)::timestamp AT TIME ZONE 'America/Lima') + "reclamo_extra_horas" * interval '1 hour')
         > greatest(r."desde", ("mes" + interval '1 month')::timestamp AT TIME ZONE 'America/Lima');
    UPDATE "mantenimiento_intervalo" SET "extendido_en" = now() WHERE "id" = r."id";
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END $$;
