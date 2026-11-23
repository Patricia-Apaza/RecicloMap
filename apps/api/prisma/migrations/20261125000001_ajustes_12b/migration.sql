-- Ajustes de la Fase 12B

-- La visibilidad de una publicación no depende de la distancia: todo negocio verificado de la ciudad la ve; la cercanía solo ordena
CREATE OR REPLACE FUNCTION "publicaciones_cercanas"(p_comprador uuid)
RETURNS TABLE ("publicacion_id" uuid, "tramo" "tramo_distancia")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", tramo_de_metros(ST_Distance(pu."ubicacion", ref."punto"))
    FROM "comprador" c
    JOIN "usuario" u ON u."id" = c."usuario_id"
    CROSS JOIN LATERAL (SELECT comprador_punto_referencia(c."id") AS "punto") ref
    JOIN "publicacion" p ON p."ciudad_id" = u."ciudad_id"
    JOIN "usuario" ur ON ur."id" = p."reciclador_id" AND ur."estado" = 'ACTIVO'
    JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
   WHERE c."id" = p_comprador
     AND c."estado_verificacion" = 'APROBADO'
     AND u."estado" = 'ACTIVO'
     AND p."estado" IN ('DISPONIBLE', 'CON_OFERTAS')
     AND p."vence_en" > now()
   ORDER BY ST_Distance(pu."ubicacion", ref."punto"), p."creada_en" DESC;
$$;
DELETE FROM "parametro_regla" WHERE "clave" = 'radio_visibilidad_km';
DELETE FROM "parametro" WHERE "clave" = 'radio_visibilidad_km'
  AND NOT EXISTS (SELECT 1 FROM "parametro_historial" h WHERE h."clave" = 'radio_visibilidad_km');

-- El cierre automático no baja de 48 h
UPDATE "parametro_regla" SET "minimo" = 48 WHERE "clave" = 'plazo_conformidad_horas';
UPDATE "parametro" SET "valor" = '48' WHERE "clave" = 'plazo_conformidad_horas' AND "valor"::numeric < 48;

-- Cada operación conserva el plazo que regía al entrar al estado; un cambio de parámetro solo aplica a las nuevas
ALTER TABLE "operacion"
  ADD COLUMN "plazo_aviso_entrega_horas" smallint,
  ADD COLUMN "plazo_conformidad_horas" smallint;
UPDATE "operacion" SET
  "plazo_aviso_entrega_horas" = parametro_numerico('plazo_aviso_entrega_horas', 72)::smallint,
  "plazo_conformidad_horas" = parametro_numerico('plazo_conformidad_horas', 72)::smallint
 WHERE "estado" IN ('ENTREGADA', 'CONFIRMADA');

CREATE OR REPLACE FUNCTION "fijar_plazos_operacion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."estado" = 'ENTREGADA' AND OLD."estado" IS DISTINCT FROM 'ENTREGADA' THEN
    NEW."plazo_aviso_entrega_horas" := parametro_numerico('plazo_aviso_entrega_horas', 72)::smallint;
  END IF;
  IF NEW."estado" = 'CONFIRMADA' AND OLD."estado" IS DISTINCT FROM 'CONFIRMADA' THEN
    NEW."plazo_conformidad_horas" := parametro_numerico('plazo_conformidad_horas', 72)::smallint;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "operacion_fijar_plazos" BEFORE UPDATE OF "estado" ON "operacion"
  FOR EACH ROW EXECUTE FUNCTION "fijar_plazos_operacion"();
