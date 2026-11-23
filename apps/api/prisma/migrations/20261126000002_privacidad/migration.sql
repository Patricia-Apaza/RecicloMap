-- Fase 13A: privacidad (exportar datos, eliminar cuenta, retención)

ALTER TABLE "usuario"
  ADD COLUMN "eliminacion_solicitada_en" TIMESTAMPTZ(3),
  ADD COLUMN "eliminacion_programada_en" TIMESTAMPTZ(3),
  ADD CONSTRAINT "usuario_eliminacion_con_fecha" CHECK ("estado" <> 'EN_ELIMINACION' OR "eliminacion_programada_en" IS NOT NULL);

-- Una cuenta anonimizada guarda un teléfono interno que no es de nadie y deja libre el número real
ALTER TABLE "usuario" DROP CONSTRAINT "usuario_telefono_formato";
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_telefono_formato"
  CHECK ("telefono" ~ '^9[0-9]{8}$' OR ("estado" = 'ELIMINADO' AND "telefono" ~ '^X[0-9a-f]{8}$'));

ALTER TABLE "comprador" ADD COLUMN "eliminado_en" TIMESTAMPTZ(3);
ALTER TABLE "comprador" DROP CONSTRAINT "comprador_whatsapp_formato";
ALTER TABLE "comprador" ADD CONSTRAINT "comprador_whatsapp_formato" CHECK ("whatsapp" ~ '^9[0-9]{8}$' OR "eliminado_en" IS NOT NULL);
ALTER TABLE "comprador" DROP CONSTRAINT "comprador_datos_por_tipo";
ALTER TABLE "comprador" ADD CONSTRAINT "comprador_datos_por_tipo" CHECK (
  "eliminado_en" IS NOT NULL
  OR ("tipo" = 'CENTRO' AND "ubicacion" IS NOT NULL AND "direccion" IS NOT NULL)
  OR ("tipo" = 'MOVIL' AND "zona_id" IS NOT NULL AND "vehiculo" IS NOT NULL)
);

-- Hechos de privacidad: solo el hecho, nunca el contenido. Solo se agrega
CREATE TABLE "registro_privacidad" (
  "id" BIGSERIAL NOT NULL,
  "usuario_id" UUID NOT NULL,
  "tipo" VARCHAR(40) NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registro_privacidad_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registro_privacidad_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id"),
  CONSTRAINT "registro_privacidad_tipo" CHECK ("tipo" IN ('EXPORTACION', 'ELIMINACION_SOLICITADA', 'ELIMINACION_CANCELADA', 'CUENTA_ANONIMIZADA', 'CONSENTIMIENTO_ACEPTADO'))
);
CREATE INDEX "registro_privacidad_creado_en_idx" ON "registro_privacidad"("creado_en");
CREATE TRIGGER "registro_privacidad_inmutable" BEFORE UPDATE OR DELETE ON "registro_privacidad"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();
CREATE TRIGGER "registro_privacidad_sin_truncar" BEFORE TRUNCATE ON "registro_privacidad"
  FOR EACH STATEMENT EXECUTE FUNCTION "rechazar_modificacion"();
REVOKE UPDATE, DELETE ON "registro_privacidad" FROM rm_api, rm_admin;
REVOKE INSERT ON "registro_privacidad" FROM rm_admin;

-- Una exportación por persona y por día de Lima
CREATE TABLE "exportacion_datos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id" UUID NOT NULL,
  "dia" DATE NOT NULL,
  "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exportacion_datos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exportacion_datos_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id"),
  CONSTRAINT "exportacion_datos_dia_key" UNIQUE ("usuario_id", "dia")
);
REVOKE ALL ON "exportacion_datos" FROM rm_admin;
REVOKE UPDATE, DELETE ON "exportacion_datos" FROM rm_api;

-- Objetos del almacén que se borran tras anonimizar una cuenta
CREATE TABLE "archivo_por_borrar" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clave" VARCHAR(200) NOT NULL,
  "clave_miniatura" VARCHAR(200),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "archivo_por_borrar_pkey" PRIMARY KEY ("id")
);
REVOKE ALL ON "archivo_por_borrar" FROM rm_admin;

-- Parámetro editable de retención (propuesta pendiente de revisión legal)
INSERT INTO "parametro" ("clave", "valor", "descripcion")
VALUES ('retencion_coordinacion_meses', '24', 'Meses que se conservan el punto, la referencia y el mensaje de una operación cerrada')
ON CONFLICT ("clave") DO NOTHING;
INSERT INTO "parametro_regla" ("clave", "minimo", "maximo", "costo_premios") VALUES ('retencion_coordinacion_meses', 6, 60, false);

-- Lo que impide eliminar una cuenta hoy
CREATE FUNCTION "cuenta_bloqueos"(p_usuario uuid) RETURNS TABLE ("tipo" text, "cantidad" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH yo AS (SELECT c."id" FROM "comprador" c WHERE c."usuario_id" = p_usuario)
  SELECT 'operaciones', count(*)::int FROM "operacion" o
   WHERE (o."reciclador_id" = p_usuario OR o."comprador_id" IN (SELECT "id" FROM yo))
     AND o."estado" NOT IN ('COMPLETADA', 'CANCELADA')
  UNION ALL
  SELECT 'incidencias', count(*)::int FROM "reporte" r
    LEFT JOIN "operacion" o ON o."id" = r."operacion_id"
   WHERE r."tipo" = 'OPERACION' AND r."estado" IN ('PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA')
     AND (r."autor_id" = p_usuario OR o."reciclador_id" = p_usuario OR o."comprador_id" IN (SELECT "id" FROM yo))
  UNION ALL
  SELECT 'entregas_directas', count(*)::int FROM "registro_reciclaje" g
   WHERE g."estado" = 'PENDIENTE' AND (g."reciclador_id" = p_usuario OR g."comprador_id" IN (SELECT "id" FROM yo))
  UNION ALL
  SELECT 'premios', count(*)::int FROM "premio_ganado" pg
   WHERE pg."usuario_id" = p_usuario
     AND (pg."estado" = 'RECLAMADO' OR (pg."estado" = 'POR_RECLAMAR' AND pg."vence_en" > now()
          AND EXISTS (SELECT 1 FROM "premio" p WHERE p."id" = pg."premio_id" AND p."tipo" = 'OBJETO')));
$$;

-- Ubicación exacta de las publicaciones de la propia persona, solo para su exportación
CREATE FUNCTION "ubicaciones_propias"(p_usuario uuid)
RETURNS TABLE ("publicacion_id" uuid, "lat" double precision, "lng" double precision, "origen" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", ST_Y(pu."ubicacion"::geometry), ST_X(pu."ubicacion"::geometry), pu."origen"::text
    FROM "publicacion" p JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
   WHERE p."reciclador_id" = p_usuario ORDER BY p."creada_en";
$$;

-- Anonimización irreversible. No toca las tablas de solo agregar: la identidad a la que apuntan deja de existir
CREATE FUNCTION "anonimizar_cuenta"(p_usuario uuid, p_ahora timestamptz DEFAULT now()) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rol "rol";
  v_estado "usuario_estado";
  v_programada timestamptz;
  v_telefono char(9);
  v_correo varchar;
  v_comprador uuid;
BEGIN
  SELECT "rol", "estado", "eliminacion_programada_en", "telefono", "correo"
    INTO v_rol, v_estado, v_programada, v_telefono, v_correo
    FROM "usuario" WHERE "id" = p_usuario FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe esa cuenta' USING ERRCODE = 'RM040';
  END IF;
  IF v_rol = 'ADMIN' THEN
    RAISE EXCEPTION 'Una cuenta de administración no se elimina desde la interfaz' USING ERRCODE = 'RM040';
  END IF;
  IF v_estado <> 'EN_ELIMINACION' OR v_programada IS NULL OR v_programada > p_ahora THEN
    RAISE EXCEPTION 'La cuenta sigue dentro del período de gracia' USING ERRCODE = 'RM040';
  END IF;
  IF EXISTS (SELECT 1 FROM cuenta_bloqueos(p_usuario) WHERE "cantidad" > 0) THEN
    RAISE EXCEPTION 'La cuenta tiene operaciones, incidencias, entregas o premios pendientes' USING ERRCODE = 'RM040';
  END IF;
  SELECT "id" INTO v_comprador FROM "comprador" WHERE "usuario_id" = p_usuario;

  -- Lo que seguía abierto se cierra: las ofertas se retiran y las publicaciones se cancelan
  UPDATE "oferta" SET "estado" = 'RETIRADA'
   WHERE "estado" = 'PENDIENTE'
     AND ("comprador_id" = v_comprador OR "publicacion_id" IN (SELECT "id" FROM "publicacion" WHERE "reciclador_id" = p_usuario));
  UPDATE "publicacion" SET "estado" = 'CANCELADA', "motivo_cancelacion" = 'La cuenta fue eliminada', "cancelada_por_id" = p_usuario
   WHERE "reciclador_id" = p_usuario AND "estado" IN ('DISPONIBLE', 'CON_OFERTAS');

  -- Fotos: se rompe el vínculo y el almacén las borra después
  UPDATE "usuario" SET "foto_id" = NULL WHERE "id" = p_usuario;
  DELETE FROM "comprador_foto" WHERE "comprador_id" = v_comprador;
  DELETE FROM "publicacion_foto" WHERE "publicacion_id" IN (SELECT "id" FROM "publicacion" WHERE "reciclador_id" = p_usuario);
  INSERT INTO "archivo_por_borrar" ("clave", "clave_miniatura")
    SELECT "clave", "clave_miniatura" FROM "archivo" WHERE "propietario_id" = p_usuario;
  DELETE FROM "archivo" WHERE "propietario_id" = p_usuario;

  -- Textos y puntos que escribió la persona sobre operaciones y publicaciones
  UPDATE "coordinacion" SET "referencia" = CASE WHEN "tipo" = 'REFERENCIA' THEN 'Dato eliminado' ELSE NULL END, "pin" = NULL, "mensaje" = NULL
   WHERE "operacion_id" IN (SELECT "id" FROM "operacion" WHERE "reciclador_id" = p_usuario OR "comprador_id" = v_comprador);
  UPDATE "publicacion" SET "nota" = NULL WHERE "reciclador_id" = p_usuario AND "nota" IS NOT NULL;
  DELETE FROM "publicacion_ubicacion" WHERE "publicacion_id" IN (SELECT "id" FROM "publicacion" WHERE "reciclador_id" = p_usuario);
  UPDATE "oferta" SET "mensaje" = NULL, "cuando_recoge" = NULL WHERE "comprador_id" = v_comprador;
  UPDATE "reciclador_perfil" SET "sobre_mi" = NULL, "zona_id" = NULL WHERE "usuario_id" = p_usuario;

  -- Negocio
  IF v_comprador IS NOT NULL THEN
    DELETE FROM "comprador_horario" WHERE "comprador_id" = v_comprador;
    DELETE FROM "comprador_pago" WHERE "comprador_id" = v_comprador;
    DELETE FROM "parada_ruta" WHERE "comprador_id" = v_comprador;
    DELETE FROM "aviso" WHERE "comprador_id" = v_comprador;
    DELETE FROM "evento_visita" WHERE "comprador_id" = v_comprador;
    DELETE FROM "solicitud_llegada" WHERE "comprador_id" = v_comprador;
    DELETE FROM "favorito" WHERE "comprador_id" = v_comprador;
    UPDATE "verificacion" SET "cambios" = NULL, "mensaje" = NULL WHERE "comprador_id" = v_comprador;
    UPDATE "comprador" SET
      "nombre_comercial" = 'Negocio eliminado', "descripcion" = NULL, "direccion" = NULL, "telefono_negocio" = NULL,
      "whatsapp" = '000000000', "ubicacion" = NULL, "posicion_aproximada" = NULL, "comparte_posicion" = false,
      "zona_id" = NULL, "ruta_publicada" = false, "hora_inicio" = NULL, "hora_fin" = NULL,
      "disponibilidad" = 'FUERA_DE_SERVICIO', "ubicacion_confirmada" = false, "eliminado_en" = now()
     WHERE "id" = v_comprador;
  END IF;

  -- Identidad, sesiones y todo lo que permite localizar a la persona
  DELETE FROM "sesion" WHERE "usuario_id" = p_usuario;
  DELETE FROM "codigo_verificacion" WHERE "usuario_id" = p_usuario OR "destino" IN (v_telefono, v_correo);
  DELETE FROM "identidad_externa" WHERE "usuario_id" = p_usuario;
  DELETE FROM "suscripcion_push" WHERE "usuario_id" = p_usuario;
  DELETE FROM "favorito" WHERE "usuario_id" = p_usuario;
  DELETE FROM "busqueda_guardada" WHERE "usuario_id" = p_usuario;
  DELETE FROM "notificacion" WHERE "usuario_id" = p_usuario;
  DELETE FROM "lista_espera_ciudad" WHERE "usuario_id" = p_usuario;
  DELETE FROM "reciclador_material" WHERE "usuario_id" = p_usuario;
  DELETE FROM "comprador_borrador" WHERE "usuario_id" = p_usuario;
  DELETE FROM "preferencia_usuario" WHERE "usuario_id" = p_usuario;

  UPDATE "usuario" SET
    "nombre" = 'Usuario eliminado',
    "telefono" = 'X' || substr(md5(random()::text || p_usuario::text || clock_timestamp()::text), 1, 8),
    "correo" = NULL, "correo_verificado_en" = NULL, "telefono_verificado_en" = NULL, "hash_contrasena" = NULL,
    "motivo_suspension" = NULL, "estado" = 'ELIMINADO', "eliminado_en" = now(), "eliminacion_programada_en" = NULL
   WHERE "id" = p_usuario;
  INSERT INTO "registro_privacidad" ("usuario_id", "tipo") VALUES (p_usuario, 'CUENTA_ANONIMIZADA');
END $$;

REVOKE EXECUTE ON FUNCTION "cuenta_bloqueos"(uuid), "ubicaciones_propias"(uuid), "anonimizar_cuenta"(uuid, timestamptz) FROM PUBLIC, rm_admin;
GRANT EXECUTE ON FUNCTION "cuenta_bloqueos"(uuid), "ubicaciones_propias"(uuid), "anonimizar_cuenta"(uuid, timestamptz) TO rm_api;
