-- Ajustes de publicaciones (decisiones de la Fase 6)

-- Volver a publicar y duplicar toman la ubicación de nuevo: ya no se copia la de la original
DROP FUNCTION "publicacion_copiar_ubicacion"(uuid, uuid);

-- Radio máximo de visibilidad; 0 = toda la ciudad (Juliaca). Por ciudad se administrará en la pantalla 63
INSERT INTO "parametro" ("clave", "valor", "descripcion")
VALUES ('radio_visibilidad_km', '0', 'Radio máximo para ver publicaciones; 0 es toda la ciudad')
ON CONFLICT ("clave") DO NOTHING;

CREATE OR REPLACE FUNCTION "publicaciones_cercanas"(p_comprador uuid)
RETURNS TABLE ("publicacion_id" uuid, "tramo" "tramo_distancia")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", tramo_de_metros(ST_Distance(pu."ubicacion", ref."punto"))
    FROM "comprador" c
    JOIN "usuario" u ON u."id" = c."usuario_id"
    CROSS JOIN LATERAL (SELECT comprador_punto_referencia(c."id") AS "punto") ref
    CROSS JOIN LATERAL (SELECT parametro_numerico('radio_visibilidad_km', 0) AS "km") radio
    JOIN "publicacion" p ON p."ciudad_id" = u."ciudad_id"
    JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
   WHERE c."id" = p_comprador
     AND c."estado_verificacion" = 'APROBADO'
     AND u."estado" = 'ACTIVO'
     AND p."estado" IN ('DISPONIBLE', 'CON_OFERTAS')
     AND p."vence_en" > now()
     AND (radio."km" <= 0 OR ST_DWithin(pu."ubicacion", ref."punto", radio."km" * 1000))
   ORDER BY ST_Distance(pu."ubicacion", ref."punto"), p."creada_en" DESC;
$$;
