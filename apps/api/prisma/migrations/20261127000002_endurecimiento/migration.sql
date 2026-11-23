-- Fase 13B: renuncia a un premio, ubicación propia restringida, controles operativos y mantenimiento

-- 1. Renunciar a un premio: solo la persona, sin devolver stock y con su constancia
ALTER TABLE "premio_ganado" ADD COLUMN "renunciado_en" TIMESTAMPTZ(3);
ALTER TABLE "premio_ganado" ADD CONSTRAINT "premio_ganado_renuncia" CHECK ("estado" <> 'RENUNCIADO' OR "renunciado_en" IS NOT NULL);
ALTER TABLE "registro_privacidad" DROP CONSTRAINT "registro_privacidad_tipo";
ALTER TABLE "registro_privacidad" ADD CONSTRAINT "registro_privacidad_tipo" CHECK ("tipo" IN
  ('EXPORTACION', 'ELIMINACION_SOLICITADA', 'ELIMINACION_CANCELADA', 'CUENTA_ANONIMIZADA', 'CONSENTIMIENTO_ACEPTADO', 'PREMIO_RENUNCIADO'));

CREATE OR REPLACE FUNCTION "transicion_premio_ganado"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  -- Solo cuenta si lo pide la función de mantenimiento (dueña de la base); nadie más puede ajustar el vencimiento de un premio
  v_api boolean := pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_admin', 'MEMBER');
  v_admin boolean := pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER');
  v_extendiendo boolean;
BEGIN
  v_extendiendo := coalesce(current_setting('rm.extendiendo_plazos', true), '') = '1' AND NOT v_api AND NOT v_admin;
  IF (NEW."id", NEW."sorteo_id", NEW."usuario_id", NEW."premio_id", NEW."codigo", NEW."punto_entrega", NEW."creado_en")
     IS DISTINCT FROM (OLD."id", OLD."sorteo_id", OLD."usuario_id", OLD."premio_id", OLD."codigo", OLD."punto_entrega", OLD."creado_en")
     OR (NEW."vence_en" IS DISTINCT FROM OLD."vence_en" AND NOT v_extendiendo) THEN
    RAISE EXCEPTION 'Los datos del premio ganado no se modifican' USING ERRCODE = 'RM030';
  END IF;
  IF NEW."estado" = OLD."estado" THEN
    IF (NEW."reclamado_en", NEW."entregado_en", NEW."renunciado_en") IS DISTINCT FROM (OLD."reclamado_en", OLD."entregado_en", OLD."renunciado_en") THEN
      RAISE EXCEPTION 'Las fechas del premio solo cambian con su estado' USING ERRCODE = 'RM030';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."estado" = 'POR_RECLAMAR' AND NEW."estado" = 'RECLAMADO' THEN
    IF now() >= OLD."vence_en" THEN
      RAISE EXCEPTION 'El plazo para reclamar este premio terminó' USING ERRCODE = 'RM031';
    END IF;
    NEW."reclamado_en" := now();
  ELSIF OLD."estado" = 'RECLAMADO' AND NEW."estado" = 'ENTREGADO' THEN
    IF v_api THEN
      RAISE EXCEPTION 'Solo administración marca un premio como entregado' USING ERRCODE = 'RM032';
    END IF;
    NEW."entregado_en" := now();
  ELSIF OLD."estado" = 'POR_RECLAMAR' AND NEW."estado" = 'VENCIDO' THEN
    IF now() < OLD."vence_en" THEN
      RAISE EXCEPTION 'El premio aún está dentro de su plazo' USING ERRCODE = 'RM031';
    END IF;
  ELSIF OLD."estado" IN ('POR_RECLAMAR', 'RECLAMADO') AND NEW."estado" = 'RENUNCIADO' THEN
    IF v_admin THEN
      RAISE EXCEPTION 'Solo la persona renuncia a su premio' USING ERRCODE = 'RM030';
    END IF;
    NEW."renunciado_en" := now();
  ELSE
    RAISE EXCEPTION 'Transición de premio no permitida: % → %', OLD."estado", NEW."estado" USING ERRCODE = 'RM030';
  END IF;
  RETURN NEW;
END $$;

-- 2. La ubicación propia solo sale para la persona autenticada y con una exportación recién hecha
DROP FUNCTION "ubicaciones_propias"(uuid);
CREATE FUNCTION "ubicaciones_propias"()
RETURNS TABLE ("publicacion_id" uuid, "lat" double precision, "lng" double precision, "origen" text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_usuario uuid := nullif(coalesce(current_setting('rm.usuario_id', true), ''), '')::uuid;
BEGIN
  IF v_usuario IS NULL OR NOT EXISTS (
    SELECT 1 FROM "exportacion_datos" e
     WHERE e."usuario_id" = v_usuario AND e."creada_en" > now() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'La ubicación propia solo se entrega a la persona autenticada durante su exportación' USING ERRCODE = 'RM041';
  END IF;
  RETURN QUERY
    SELECT p."id", ST_Y(pu."ubicacion"::geometry), ST_X(pu."ubicacion"::geometry), pu."origen"::text
      FROM "publicacion" p JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
     WHERE p."reciclador_id" = v_usuario ORDER BY p."creada_en";
END $$;
REVOKE EXECUTE ON FUNCTION "ubicaciones_propias"() FROM PUBLIC, rm_admin;
GRANT EXECUTE ON FUNCTION "ubicaciones_propias"() TO rm_api;

-- 3. Controles operativos: aviso global, registro abierto o cerrado y mantenimiento
CREATE TABLE "control_operativo" (
  "id" SMALLINT NOT NULL DEFAULT 1,
  "banner_texto" VARCHAR(140),
  "banner_desde" TIMESTAMPTZ(3),
  "banner_hasta" TIMESTAMPTZ(3),
  "banner_version" INTEGER NOT NULL DEFAULT 0,
  "registro_reciclador_abierto" BOOLEAN NOT NULL DEFAULT true,
  "registro_negocio_abierto" BOOLEAN NOT NULL DEFAULT true,
  "mantenimiento_activo" BOOLEAN NOT NULL DEFAULT false,
  "mantenimiento_mensaje" VARCHAR(200),
  "mantenimiento_desde" TIMESTAMPTZ(3),
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "control_operativo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "control_operativo_unico" CHECK ("id" = 1),
  CONSTRAINT "control_operativo_banner" CHECK ("banner_texto" IS NULL OR ("banner_desde" IS NOT NULL AND "banner_hasta" IS NOT NULL AND "banner_hasta" > "banner_desde" AND length("banner_texto") BETWEEN 1 AND 140)),
  CONSTRAINT "control_operativo_mantenimiento" CHECK (NOT "mantenimiento_activo" OR "mantenimiento_mensaje" IS NOT NULL)
);
INSERT INTO "control_operativo" ("id") VALUES (1);
REVOKE INSERT, UPDATE, DELETE ON "control_operativo" FROM rm_api, rm_admin;
GRANT UPDATE ("banner_texto", "banner_desde", "banner_hasta", "banner_version", "registro_reciclador_abierto", "registro_negocio_abierto",
              "mantenimiento_activo", "mantenimiento_mensaje", "mantenimiento_desde", "actualizado_en") ON "control_operativo" TO rm_admin;

-- Cada mantenimiento deja su intervalo para devolver a todos el tiempo que no pudieron actuar
CREATE TABLE "mantenimiento_intervalo" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "desde" TIMESTAMPTZ(3) NOT NULL,
  "hasta" TIMESTAMPTZ(3),
  "extendido_en" TIMESTAMPTZ(3),
  CONSTRAINT "mantenimiento_intervalo_pkey" PRIMARY KEY ("id")
);
REVOKE INSERT, UPDATE, DELETE ON "mantenimiento_intervalo" FROM rm_api, rm_admin;

CREATE FUNCTION "registrar_intervalo_mantenimiento"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."mantenimiento_activo" AND NOT OLD."mantenimiento_activo" THEN
    NEW."mantenimiento_desde" := now();
    INSERT INTO "mantenimiento_intervalo" ("desde") VALUES (now());
  ELSIF NOT NEW."mantenimiento_activo" AND OLD."mantenimiento_activo" THEN
    UPDATE "mantenimiento_intervalo" SET "hasta" = now() WHERE "hasta" IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "control_operativo_intervalo" BEFORE UPDATE OF "mantenimiento_activo" ON "control_operativo"
  FOR EACH ROW EXECUTE FUNCTION "registrar_intervalo_mantenimiento"();

-- Cambiar un control exige su constancia con motivo en la auditoría, en la misma operación
CREATE FUNCTION "validar_control_operativo"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT EXISTS (
    SELECT 1 FROM "auditoria" a
     WHERE a."tx_id" = txid_current() AND a."tipo" = 'CONFIGURACION' AND a."entidad" = 'control_operativo'
       AND a."accion" IN ('BANNER', 'REGISTRO', 'MANTENIMIENTO') AND length(a."motivo") >= 5
  ) THEN
    RAISE EXCEPTION 'Cambiar un control operativo exige su motivo en la auditoría' USING ERRCODE = 'RM042';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "control_operativo_validar" AFTER UPDATE ON "control_operativo"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validar_control_operativo"();

-- 4. Al terminar un mantenimiento, nadie pierde un plazo: cada plazo vigente se corre lo que duró
CREATE FUNCTION "extender_plazos_mantenimiento"() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_dur interval;
  v_horas integer;
  v_total integer := 0;
BEGIN
  PERFORM set_config('rm.extendiendo_plazos', '1', true);
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
    UPDATE "mantenimiento_intervalo" SET "extendido_en" = now() WHERE "id" = r."id";
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END $$;
REVOKE EXECUTE ON FUNCTION "extender_plazos_mantenimiento"() FROM PUBLIC, rm_admin;
GRANT EXECUTE ON FUNCTION "extender_plazos_mantenimiento"() TO rm_api;

-- 5. Freno contra fuerza bruta por cuenta: tras varios fallos seguidos el ingreso espera cada vez más
ALTER TABLE "usuario"
  ADD COLUMN "fallos_acceso" SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN "acceso_bloqueado_hasta" TIMESTAMPTZ(3);
