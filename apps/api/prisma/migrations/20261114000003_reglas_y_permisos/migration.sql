-- Reglas de negocio, funciones geográficas y permisos que Prisma no expresa en el esquema.

-- 1. Restricciones de dominio
ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_telefono_formato" CHECK ("telefono" ~ '^9[0-9]{8}$'),
  ADD CONSTRAINT "usuario_correo_minusculas" CHECK ("correo" = lower("correo")),
  ADD CONSTRAINT "usuario_suspension_con_motivo" CHECK ("estado" <> 'SUSPENDIDO' OR "motivo_suspension" IS NOT NULL);

ALTER TABLE "comprador"
  ADD CONSTRAINT "comprador_whatsapp_formato" CHECK ("whatsapp" ~ '^9[0-9]{8}$'),
  ADD CONSTRAINT "comprador_datos_por_tipo" CHECK (
    ("tipo" = 'CENTRO' AND "ubicacion" IS NOT NULL AND "direccion" IS NOT NULL)
    OR ("tipo" = 'MOVIL' AND "zona_id" IS NOT NULL AND "vehiculo" IS NOT NULL)
  ),
  ADD CONSTRAINT "comprador_plan_pro_con_fechas" CHECK (
    "plan" = 'GRATIS' OR ("plan_desde" IS NOT NULL AND "plan_hasta" IS NOT NULL AND "plan_hasta" >= "plan_desde")
  );

ALTER TABLE "comprador_horario"
  ADD CONSTRAINT "comprador_horario_dia" CHECK ("dia" BETWEEN 1 AND 7),
  ADD CONSTRAINT "comprador_horario_orden" CHECK ("cierra" > "abre");

ALTER TABLE "parada_ruta"
  ADD CONSTRAINT "parada_ruta_orden_horas" CHECK ("hasta" > "desde");

ALTER TABLE "precio_material"
  ADD CONSTRAINT "precio_material_minimo_positivo" CHECK ("precio_min" > 0),
  ADD CONSTRAINT "precio_material_rango" CHECK ("precio_max" >= "precio_min");

ALTER TABLE "moderacion_precio"
  ADD CONSTRAINT "moderacion_correccion_con_plazo" CHECK ("estado" <> 'CORRECCION_PEDIDA' OR "plazo_hasta" IS NOT NULL),
  ADD CONSTRAINT "moderacion_cierre_con_motivo" CHECK ("cerrada_en" IS NULL OR "motivo_cierre" IS NOT NULL);

ALTER TABLE "publicacion"
  ADD CONSTRAINT "publicacion_cantidad" CHECK ("cantidad_kg" BETWEEN 1 AND 5000),
  ADD CONSTRAINT "publicacion_precio_esperado" CHECK ("precio_esperado" IS NULL OR "precio_esperado" > 0),
  ADD CONSTRAINT "publicacion_vigencia" CHECK ("vence_en" > "creada_en"),
  ADD CONSTRAINT "publicacion_cancelacion_con_motivo" CHECK ("estado" <> 'CANCELADA' OR "motivo_cancelacion" IS NOT NULL);

ALTER TABLE "oferta"
  ADD CONSTRAINT "oferta_precio_positivo" CHECK ("precio_kg" > 0),
  ADD CONSTRAINT "oferta_total_positivo" CHECK ("total" > 0);

ALTER TABLE "operacion"
  ADD CONSTRAINT "operacion_kg_final_positivo" CHECK ("kg_final" IS NULL OR "kg_final" > 0),
  ADD CONSTRAINT "operacion_peso_al_confirmar" CHECK (
    "estado" NOT IN ('CONFIRMADA', 'COMPLETADA') OR ("kg_final" IS NOT NULL AND "monto_final" IS NOT NULL)
  ),
  ADD CONSTRAINT "operacion_cancelacion_con_motivo" CHECK ("estado" <> 'CANCELADA' OR "motivo_cancelacion" IS NOT NULL),
  ADD CONSTRAINT "operacion_disputa_solo_abierta" CHECK (NOT "en_disputa" OR "estado" IN ('ENTREGADA', 'CONFIRMADA'));

ALTER TABLE "coordinacion"
  ADD CONSTRAINT "coordinacion_referencia" CHECK ("tipo" = 'LOCAL_DEL_CENTRO' OR "referencia" IS NOT NULL);

ALTER TABLE "calificacion"
  ADD CONSTRAINT "calificacion_estrellas" CHECK ("estrellas" BETWEEN 1 AND 5),
  ADD CONSTRAINT "calificacion_no_a_si_mismo" CHECK ("autor_id" <> "destino_id");

ALTER TABLE "registro_reciclaje"
  ADD CONSTRAINT "registro_kg" CHECK ("kg" > 0 AND "kg" <= 5000),
  ADD CONSTRAINT "registro_kg_confirmado" CHECK ("kg_confirmado" IS NULL OR ("kg_confirmado" > 0 AND "kg_confirmado" <= 5000)),
  ADD CONSTRAINT "registro_rechazo_con_motivo" CHECK ("estado" <> 'RECHAZADO' OR "motivo_rechazo" IS NOT NULL);

ALTER TABLE "reporte"
  ADD CONSTRAINT "reporte_destino_por_tipo" CHECK (
    ("tipo" = 'NEGOCIO' AND "comprador_id" IS NOT NULL)
    OR ("tipo" = 'OPERACION' AND "operacion_id" IS NOT NULL)
    OR ("tipo" = 'RESENA' AND "calificacion_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "reporte_cierre_con_decision" CHECK ("estado" NOT IN ('RESUELTO', 'DESCARTADO') OR "decision" IS NOT NULL),
  ADD CONSTRAINT "reporte_correccion_con_plazo" CHECK ("estado" <> 'CORRECCION_PEDIDA' OR "plazo_hasta" IS NOT NULL);

ALTER TABLE "premio"
  ADD CONSTRAINT "premio_probabilidad" CHECK ("probabilidad" BETWEEN 0 AND 100),
  ADD CONSTRAINT "premio_stock" CHECK ("stock" IS NULL OR "stock" >= 0),
  ADD CONSTRAINT "premio_datos_por_tipo" CHECK (
    ("tipo" = 'PUNTOS' AND "puntos" > 0)
    OR ("tipo" = 'OBJETO' AND "punto_entrega" IS NOT NULL AND "vigencia_canje_dias" > 0)
    OR "tipo" = 'SIN_PREMIO'
  );

ALTER TABLE "movimiento_puntos"
  ADD CONSTRAINT "movimiento_puntos_no_cero" CHECK ("puntos" <> 0),
  ADD CONSTRAINT "movimiento_giros_solo_por_reciclaje" CHECK (
    "cuenta_para_giros" = ("motivo" IN ('OPERACION', 'REGISTRO_DIRECTO'))
  );

ALTER TABLE "giro"
  ADD CONSTRAINT "giro_origen_coherente" CHECK (
    ("origen" = 'PUNTOS' AND "numero" IS NOT NULL AND "desafio_id" IS NULL)
    OR ("origen" = 'META_MES' AND "desafio_id" IS NOT NULL AND "numero" IS NULL)
  );

ALTER TABLE "desafio"
  ADD CONSTRAINT "desafio_mes_primer_dia" CHECK (EXTRACT(DAY FROM "mes") = 1);

ALTER TABLE "usuario_desafio"
  ADD CONSTRAINT "usuario_desafio_reclamo" CHECK ("reclamado_en" IS NULL OR "completado_en" IS NOT NULL);

ALTER TABLE "pago_plan"
  ADD CONSTRAINT "pago_plan_monto" CHECK ("monto" > 0),
  ADD CONSTRAINT "pago_plan_periodo" CHECK ("periodo_hasta" >= "periodo_desde");

ALTER TABLE "evento_visita"
  ADD CONSTRAINT "evento_visita_hora" CHECK ("hora" BETWEEN 0 AND 23);

-- 2. Unicidad condicional
-- Una oferta vigente por negocio y publicación; tras un rechazo no se vuelve a ofertar
CREATE UNIQUE INDEX "oferta_vigente_unica" ON "oferta" ("publicacion_id", "comprador_id") WHERE "estado" <> 'RETIRADA';

CREATE UNIQUE INDEX "moderacion_precio_abierta_unica" ON "moderacion_precio" ("precio_material_id") WHERE "cerrada_en" IS NULL;

CREATE UNIQUE INDEX "verificacion_abierta_unica" ON "verificacion" ("comprador_id") WHERE "estado" IN ('EN_REVISION', 'INFO_PEDIDA');

CREATE UNIQUE INDEX "registro_reciclaje_sin_duplicados" ON "registro_reciclaje" ("reciclador_id", "comprador_id", "material_id", "fecha")
  WHERE "estado" IN ('PENDIENTE', 'CONFIRMADO');

CREATE UNIQUE INDEX "plantilla_desafio_meta_mes_unica" ON "plantilla_desafio" ("es_meta_mes") WHERE "es_meta_mes" AND "activa";

CREATE UNIQUE INDEX "desafio_meta_mes_unica" ON "desafio" ("mes") WHERE "es_meta_mes";

CREATE UNIQUE INDEX "solicitud_plan_pendiente_unica" ON "solicitud_plan" ("comprador_id") WHERE "estado" = 'PENDIENTE';

-- 3. Parámetros
CREATE FUNCTION "parametro_numerico"(p_clave text, p_defecto numeric) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT "valor"::numeric FROM "parametro" WHERE "clave" = p_clave), p_defecto);
$$;

CREATE FUNCTION "validar_precio_kg"(p_precio numeric) RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_precio < parametro_numerico('precio_kg_minimo', 0.10) OR p_precio > parametro_numerico('precio_kg_maximo', 50.00) THEN
    RAISE EXCEPTION 'El precio por kg debe estar entre S/ % y S/ %',
      parametro_numerico('precio_kg_minimo', 0.10), parametro_numerico('precio_kg_maximo', 50.00)
      USING ERRCODE = 'RM002';
  END IF;
END $$;

-- 4. Precios: solo el dueño, dentro de los límites, con historial
CREATE FUNCTION "precio_material_validar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_dueno uuid;
BEGIN
  SELECT "usuario_id" INTO v_dueno FROM "comprador" WHERE "id" = NEW."comprador_id";
  IF NEW."actualizado_por_id" IS DISTINCT FROM v_dueno THEN
    RAISE EXCEPTION 'Solo el dueño del negocio puede fijar o cambiar sus precios' USING ERRCODE = 'RM001';
  END IF;
  PERFORM validar_precio_kg(NEW."precio_min");
  PERFORM validar_precio_kg(NEW."precio_max");
  RETURN NEW;
END $$;

CREATE TRIGGER "precio_material_validar" BEFORE INSERT OR UPDATE ON "precio_material"
  FOR EACH ROW EXECUTE FUNCTION "precio_material_validar"();

CREATE FUNCTION "precio_material_historial"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."precio_min" <> OLD."precio_min" OR NEW."precio_max" <> OLD."precio_max" THEN
    INSERT INTO "historial_precio" ("precio_material_id", "precio_min", "precio_max", "autor_id")
    VALUES (NEW."id", NEW."precio_min", NEW."precio_max", NEW."actualizado_por_id");
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "precio_material_historial" AFTER INSERT OR UPDATE ON "precio_material"
  FOR EACH ROW EXECUTE FUNCTION "precio_material_historial"();

-- 5. Publicación y oferta: límites de precio y total calculado
CREATE FUNCTION "publicacion_validar_precio"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."precio_esperado" IS NOT NULL THEN
    PERFORM validar_precio_kg(NEW."precio_esperado");
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "publicacion_validar_precio" BEFORE INSERT OR UPDATE OF "precio_esperado" ON "publicacion"
  FOR EACH ROW EXECUTE FUNCTION "publicacion_validar_precio"();

CREATE FUNCTION "oferta_calcular_total"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM validar_precio_kg(NEW."precio_kg");
  SELECT round(NEW."precio_kg" * "cantidad_kg", 2) INTO NEW."total" FROM "publicacion" WHERE "id" = NEW."publicacion_id";
  RETURN NEW;
END $$;

CREATE TRIGGER "oferta_calcular_total" BEFORE INSERT OR UPDATE OF "precio_kg" ON "oferta"
  FOR EACH ROW EXECUTE FUNCTION "oferta_calcular_total"();

-- 6. Transiciones de estado permitidas
CREATE FUNCTION "publicacion_validar_transicion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."estado" = OLD."estado" THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."estado" = 'DISPONIBLE' AND NEW."estado" IN ('CON_OFERTAS', 'CANCELADA', 'VENCIDA'))
    OR (OLD."estado" = 'CON_OFERTAS' AND NEW."estado" IN ('DISPONIBLE', 'EN_NEGOCIACION', 'CANCELADA', 'VENCIDA'))
    OR (OLD."estado" = 'EN_NEGOCIACION' AND NEW."estado" IN ('FINALIZADA', 'CANCELADA'))
  ) THEN
    RAISE EXCEPTION 'Transición de publicación no permitida: % a %', OLD."estado", NEW."estado" USING ERRCODE = 'RM010';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "publicacion_validar_transicion" BEFORE UPDATE OF "estado" ON "publicacion"
  FOR EACH ROW EXECUTE FUNCTION "publicacion_validar_transicion"();

CREATE FUNCTION "oferta_validar_transicion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."estado" = OLD."estado" THEN
    RETURN NEW;
  END IF;
  IF OLD."estado" <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Transición de oferta no permitida: % a %', OLD."estado", NEW."estado" USING ERRCODE = 'RM011';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "oferta_validar_transicion" BEFORE UPDATE OF "estado" ON "oferta"
  FOR EACH ROW EXECUTE FUNCTION "oferta_validar_transicion"();

CREATE FUNCTION "operacion_validar_cambio"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."estado" IN ('COMPLETADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'Una operación % ya no se puede modificar', OLD."estado" USING ERRCODE = 'RM012';
  END IF;
  IF NEW."estado" = OLD."estado" THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."estado" = 'ACEPTADA' AND NEW."estado" IN ('EN_COORDINACION', 'CANCELADA'))
    OR (OLD."estado" = 'EN_COORDINACION' AND NEW."estado" IN ('ENTREGADA', 'CANCELADA'))
    OR (OLD."estado" = 'ENTREGADA' AND NEW."estado" = 'CONFIRMADA')
    OR (OLD."estado" = 'CONFIRMADA' AND NEW."estado" = 'COMPLETADA')
    -- Tras la entrega solo se anula al resolver una disputa
    OR (OLD."estado" IN ('ENTREGADA', 'CONFIRMADA') AND NEW."estado" = 'CANCELADA' AND OLD."en_disputa")
  ) THEN
    RAISE EXCEPTION 'Transición de operación no permitida: % a %', OLD."estado", NEW."estado" USING ERRCODE = 'RM012';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "operacion_validar_cambio" BEFORE UPDATE ON "operacion"
  FOR EACH ROW EXECUTE FUNCTION "operacion_validar_cambio"();

CREATE FUNCTION "operacion_validar_alta"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_publicacion uuid;
  v_comprador uuid;
  v_reciclador uuid;
BEGIN
  SELECT o."publicacion_id", o."comprador_id", p."reciclador_id"
    INTO v_publicacion, v_comprador, v_reciclador
    FROM "oferta" o JOIN "publicacion" p ON p."id" = o."publicacion_id"
   WHERE o."id" = NEW."oferta_id";
  IF v_publicacion IS DISTINCT FROM NEW."publicacion_id"
     OR v_comprador IS DISTINCT FROM NEW."comprador_id"
     OR v_reciclador IS DISTINCT FROM NEW."reciclador_id" THEN
    RAISE EXCEPTION 'La operación no coincide con su oferta y su publicación' USING ERRCODE = 'RM013';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "operacion_validar_alta" BEFORE INSERT ON "operacion"
  FOR EACH ROW EXECUTE FUNCTION "operacion_validar_alta"();

-- 7. Calificaciones: solo tras operación completada, entre sus partes
CREATE FUNCTION "calificacion_validar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_estado operacion_estado;
  v_reciclador uuid;
  v_negocio uuid;
BEGIN
  SELECT o."estado", o."reciclador_id", c."usuario_id"
    INTO v_estado, v_reciclador, v_negocio
    FROM "operacion" o JOIN "comprador" c ON c."id" = o."comprador_id"
   WHERE o."id" = NEW."operacion_id";
  IF v_estado IS DISTINCT FROM 'COMPLETADA' THEN
    RAISE EXCEPTION 'Solo se puede calificar una operación completada' USING ERRCODE = 'RM020';
  END IF;
  IF NOT (
    (NEW."autor_id" = v_reciclador AND NEW."destino_id" = v_negocio)
    OR (NEW."autor_id" = v_negocio AND NEW."destino_id" = v_reciclador)
  ) THEN
    RAISE EXCEPTION 'Solo las partes de la operación pueden calificarse entre sí' USING ERRCODE = 'RM021';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "calificacion_validar" BEFORE INSERT ON "calificacion"
  FOR EACH ROW EXECUTE FUNCTION "calificacion_validar"();

CREATE FUNCTION "calificacion_recalcular"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_prom numeric(3, 2);
  v_cant integer;
BEGIN
  SELECT round(avg("estrellas"), 2), count(*) INTO v_prom, v_cant FROM "calificacion" WHERE "destino_id" = NEW."destino_id";
  UPDATE "comprador" SET "calif_prom" = v_prom, "calif_cant" = v_cant WHERE "usuario_id" = NEW."destino_id";
  UPDATE "reciclador_perfil" SET "calif_prom" = v_prom, "calif_cant" = v_cant WHERE "usuario_id" = NEW."destino_id";
  RETURN NEW;
END $$;

CREATE TRIGGER "calificacion_recalcular" AFTER INSERT ON "calificacion"
  FOR EACH ROW EXECUTE FUNCTION "calificacion_recalcular"();

-- 8. Tablas de solo inserción y lectura
CREATE FUNCTION "rechazar_modificacion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % solo admite insertar y leer', TG_TABLE_NAME USING ERRCODE = 'RM030';
END $$;

CREATE TRIGGER "auditoria_inmutable" BEFORE UPDATE OR DELETE ON "auditoria"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();
CREATE TRIGGER "auditoria_sin_vaciado" BEFORE TRUNCATE ON "auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION "rechazar_modificacion"();

CREATE TRIGGER "sorteo_ruleta_inmutable" BEFORE UPDATE OR DELETE ON "sorteo_ruleta"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();
CREATE TRIGGER "sorteo_ruleta_sin_vaciado" BEFORE TRUNCATE ON "sorteo_ruleta"
  FOR EACH STATEMENT EXECUTE FUNCTION "rechazar_modificacion"();

CREATE TRIGGER "ruleta_configuracion_inmutable" BEFORE UPDATE OR DELETE ON "ruleta_configuracion"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();

CREATE TRIGGER "historial_precio_inmutable" BEFORE UPDATE OR DELETE ON "historial_precio"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();

-- 9. Distancia por tramos
CREATE FUNCTION "tramo_de_metros"(p_metros double precision) RETURNS "tramo_distancia"
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_metros IS NULL THEN NULL
    WHEN p_metros < 1000 THEN 'menos de 1 km'
    WHEN p_metros < 2000 THEN '1–2 km'
    WHEN p_metros <= 5000 THEN '2–5 km'
    ELSE 'más de 5 km'
  END::tramo_distancia;
$$;

-- Punto fijo del negocio: su local o el centro de su zona de trabajo
CREATE FUNCTION "comprador_punto_referencia"(p_comprador uuid) RETURNS geography
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(c."ubicacion", z."centro")
    FROM "comprador" c LEFT JOIN "zona" z ON z."id" = c."zona_id"
   WHERE c."id" = p_comprador;
$$;

CREATE FUNCTION "publicacion_tramo"(p_publicacion uuid, p_comprador uuid) RETURNS "tramo_distancia"
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT tramo_de_metros(ST_Distance(pu."ubicacion", comprador_punto_referencia(p_comprador)))
    FROM "publicacion_ubicacion" pu
   WHERE pu."publicacion_id" = p_publicacion;
$$;

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
     AND ST_DWithin(pu."ubicacion", ref."punto", parametro_numerico('radio_maximo_km', 20) * 1000)
   ORDER BY 2, p."creada_en" DESC;
$$;

-- 10. Vista del mapa
CREATE VIEW "v_mapa" AS
SELECT
  c."id" AS "comprador_id",
  c."tipo",
  c."nombre_comercial",
  (c."plan" = 'PRO' AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN c."plan_desde" AND c."plan_hasta") AS "es_pro",
  c."calif_prom",
  c."calif_cant",
  c."disponibilidad",
  c."zona_id",
  u."ciudad_id",
  COALESCE(c."ubicacion", z."centro") AS "punto",
  pm."id" AS "precio_material_id",
  pm."material_id",
  pm."precio_min",
  pm."precio_max",
  pm."demanda",
  pm."actualizado_en"
FROM "comprador" c
JOIN "usuario" u ON u."id" = c."usuario_id"
JOIN "precio_material" pm ON pm."comprador_id" = c."id"
LEFT JOIN "zona" z ON z."id" = c."zona_id"
WHERE c."estado_verificacion" = 'APROBADO'
  AND u."estado" = 'ACTIVO'
  AND pm."activo"
  AND (c."tipo" = 'CENTRO' OR c."mostrar_zona")
  AND NOT EXISTS (
    SELECT 1 FROM "moderacion_precio" m
     WHERE m."precio_material_id" = pm."id" AND m."estado" = 'SUSPENDIDO' AND m."cerrada_en" IS NULL
  );

-- 11. Usuarios de base de datos y permisos
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rm_api') THEN
    CREATE ROLE rm_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rm_admin') THEN
    CREATE ROLE rm_admin NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO rm_api, rm_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rm_api, rm_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rm_api, rm_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rm_api, rm_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rm_api, rm_admin;

-- La tabla de control de migraciones no existe en la base temporal que usa Prisma al comparar
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM rm_api, rm_admin;
  END IF;
END $$;

-- La ubicación del reciclador se puede guardar, pero no leer
REVOKE ALL ON "publicacion_ubicacion" FROM rm_api, rm_admin;
GRANT INSERT ON "publicacion_ubicacion" TO rm_api;

-- El administrador solo lee precios; el historial lo escribe únicamente su disparador
REVOKE INSERT, UPDATE, DELETE ON "precio_material" FROM rm_admin;
REVOKE INSERT, UPDATE, DELETE ON "historial_precio" FROM rm_api, rm_admin;

-- El administrador no escribe el peso ni el monto de una operación
REVOKE INSERT, UPDATE, DELETE ON "operacion" FROM rm_admin;
GRANT UPDATE ("estado", "en_disputa", "motivo_cancelacion", "cancelada_por_id", "cancelada_en", "completada_en", "completada_por_plazo")
  ON "operacion" TO rm_admin;

-- Auditoría, sorteos y configuraciones de ruleta: solo insertar y leer
REVOKE UPDATE, DELETE ON "auditoria", "sorteo_ruleta", "ruleta_configuracion" FROM rm_api, rm_admin;

-- El tramo solo se obtiene a través de estas funciones
REVOKE ALL ON FUNCTION "publicacion_tramo"(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "publicaciones_cercanas"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "publicacion_tramo"(uuid, uuid) TO rm_api;
GRANT EXECUTE ON FUNCTION "publicaciones_cercanas"(uuid) TO rm_api;
