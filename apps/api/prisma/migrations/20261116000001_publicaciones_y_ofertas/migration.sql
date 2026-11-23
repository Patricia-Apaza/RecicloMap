-- Publicaciones y ofertas (Fase 6)

-- Aviso "por vencer" enviado una sola vez por vigencia; al renovar vuelve a quedar vacío
ALTER TABLE "publicacion" ADD COLUMN "aviso_vencer_en" TIMESTAMPTZ(3);

-- El comprador móvil cambia su zona de trabajo como máximo una vez al día (evita acotar la posición del reciclador)
ALTER TABLE "comprador" ADD COLUMN "zona_actualizada_en" TIMESTAMPTZ(3);

INSERT INTO "parametro" ("clave", "valor", "descripcion")
VALUES ('radio_aviso_publicacion_km', '5', 'Distancia máxima para avisar a un negocio de una nueva publicación')
ON CONFLICT ("clave") DO NOTHING;

-- RF-23: la publicación la ven todos los negocios verificados de la ciudad, compren o no ese material
DROP FUNCTION "publicaciones_cercanas"(uuid);
CREATE FUNCTION "publicaciones_cercanas"(p_comprador uuid)
RETURNS TABLE ("publicacion_id" uuid, "tramo" "tramo_distancia")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", tramo_de_metros(ST_Distance(pu."ubicacion", ref."punto"))
    FROM "comprador" c
    JOIN "usuario" u ON u."id" = c."usuario_id"
    CROSS JOIN LATERAL (SELECT comprador_punto_referencia(c."id") AS "punto") ref
    JOIN "publicacion" p ON p."ciudad_id" = u."ciudad_id"
    JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
   WHERE c."id" = p_comprador
     AND c."estado_verificacion" = 'APROBADO'
     AND u."estado" = 'ACTIVO'
     AND p."estado" IN ('DISPONIBLE', 'CON_OFERTAS')
     AND p."vence_en" > now()
   ORDER BY ST_Distance(pu."ubicacion", ref."punto"), p."creada_en" DESC;
$$;

-- Negocios a los que se avisa de una publicación nueva: verificados, de la ciudad y a la distancia indicada
CREATE FUNCTION "negocios_para_aviso"(p_publicacion uuid, p_metros double precision)
RETURNS TABLE ("comprador_id" uuid, "usuario_id" uuid, "tramo" "tramo_distancia")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c."id", c."usuario_id", tramo_de_metros(ST_Distance(pu."ubicacion", comprador_punto_referencia(c."id")))
    FROM "publicacion" p
    JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
    JOIN "usuario" u ON u."ciudad_id" = p."ciudad_id" AND u."estado" = 'ACTIVO'
    JOIN "comprador" c ON c."usuario_id" = u."id" AND c."estado_verificacion" = 'APROBADO'
   WHERE p."id" = p_publicacion
     AND ST_DWithin(pu."ubicacion", comprador_punto_referencia(c."id"), p_metros);
$$;

-- Distancia del negocio a la publicación, solo para su dueño (la API comprueba que lo sea)
CREATE FUNCTION "publicacion_distancia_km"(p_publicacion uuid, p_comprador uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT round((ST_Distance(pu."ubicacion", comprador_punto_referencia(p_comprador)) / 1000)::numeric, 1)
    FROM "publicacion_ubicacion" pu
   WHERE pu."publicacion_id" = p_publicacion;
$$;

-- Volver a publicar o duplicar conserva el punto original sin que la API lo lea
CREATE FUNCTION "publicacion_copiar_ubicacion"(p_origen uuid, p_destino uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "publicacion" o JOIN "publicacion" d ON d."reciclador_id" = o."reciclador_id"
     WHERE o."id" = p_origen AND d."id" = p_destino
  ) THEN
    RAISE EXCEPTION 'Solo se copia la ubicación entre publicaciones del mismo reciclador' USING ERRCODE = 'RM014';
  END IF;
  INSERT INTO "publicacion_ubicacion" ("publicacion_id", "ubicacion", "origen")
  SELECT p_destino, pu."ubicacion", pu."origen" FROM "publicacion_ubicacion" pu WHERE pu."publicacion_id" = p_origen;
END $$;

REVOKE ALL ON FUNCTION "negocios_para_aviso"(uuid, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION "publicacion_distancia_km"(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "publicacion_copiar_ubicacion"(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "publicaciones_cercanas"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "negocios_para_aviso"(uuid, double precision) TO rm_api;
GRANT EXECUTE ON FUNCTION "publicacion_distancia_km"(uuid, uuid) TO rm_api;
GRANT EXECUTE ON FUNCTION "publicacion_copiar_ubicacion"(uuid, uuid) TO rm_api;
GRANT EXECUTE ON FUNCTION "publicaciones_cercanas"(uuid) TO rm_api;
