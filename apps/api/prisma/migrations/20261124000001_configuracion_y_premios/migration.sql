-- Fase 12B: parámetros con rango, ciudades con requisitos, premios con catálogo validado, entregas y pausa de la ruleta.
-- Lo que la administración cambia lo valida la base: rango, motivo y constancia en la misma operación.

-- Rangos de los parámetros que la administración puede editar (iguales a los de packages/shared)
CREATE TABLE "parametro_regla" (
  "clave" VARCHAR(60) NOT NULL,
  "minimo" NUMERIC NOT NULL,
  "maximo" NUMERIC NOT NULL,
  "costo_premios" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "parametro_regla_pkey" PRIMARY KEY ("clave"),
  CONSTRAINT "parametro_regla_rango" CHECK ("minimo" <= "maximo")
);
INSERT INTO "parametro_regla" ("clave", "minimo", "maximo", "costo_premios") VALUES
  ('radio_defecto_km', 1, 20, false),
  ('radio_maximo_km', 5, 50, false),
  ('radio_visibilidad_km', 0, 100, false),
  ('radio_aviso_publicacion_km', 1, 50, false),
  ('dias_precio_al_dia', 1, 14, false),
  ('vigencia_publicacion_dias', 1, 30, false),
  ('plazo_aviso_entrega_horas', 24, 168, false),
  ('plazo_conformidad_horas', 24, 168, false),
  ('aviso_max_activos', 1, 10, false),
  ('aviso_vigencia_max_dias', 1, 30, false),
  ('reportes_max_abiertos_reciclador', 1, 20, false),
  ('reportes_max_por_negocio_24h', 1, 10, false),
  ('colusion_operaciones_par_7_dias', 2, 10, false),
  ('colusion_desvio_peso_pct', 10, 90, false),
  ('colusion_kg_operacion', 100, 5000, false),
  ('recomendado_ventaja_pro_m', 0, 2000, false),
  ('plan_aviso_vence_dias', 1, 30, false),
  ('premio_aviso_dias', 1, 15, false),
  ('premio_stock_bajo', 1, 50, false),
  ('puntos_por_invitacion', 0, 100, false),
  ('registro_directo_max_pendientes', 1, 10, false),
  ('registro_directo_vigencia_dias', 1, 30, false),
  ('desafio_reclamo_dias', 1, 15, false),
  ('ranking_max_filas', 5, 100, false),
  ('puntos_por_giro', 100, 5000, true),
  ('meta_mes_kg', 20, 1000, true),
  ('tope_diario_registro_directo', 50, 1000, true),
  ('ruleta_en_pausa', 0, 1, false);

INSERT INTO "parametro" ("clave", "valor", "descripcion") VALUES
  ('ruleta_en_pausa', '0', 'La administración pausó la ruleta: 1 pausada, 0 en marcha'),
  ('premio_stock_bajo', '5', 'Unidades a partir de las cuales el stock de un premio se considera bajo')
ON CONFLICT ("clave") DO NOTHING;

-- Historial de cambios de cada parámetro: solo se agrega y se lee
CREATE TABLE "parametro_historial" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clave" VARCHAR(60) NOT NULL,
  "valor_anterior" VARCHAR(200) NOT NULL,
  "valor_nuevo" VARCHAR(200) NOT NULL,
  "motivo" VARCHAR(200) NOT NULL,
  "admin_id" UUID NOT NULL,
  "tx_id" BIGINT NOT NULL DEFAULT txid_current(),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parametro_historial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parametro_historial_admin_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id"),
  CONSTRAINT "parametro_historial_motivo" CHECK (length("motivo") >= 5)
);
CREATE INDEX "parametro_historial_clave_creado_en_idx" ON "parametro_historial"("clave", "creado_en");
CREATE TRIGGER "parametro_historial_inmutable" BEFORE UPDATE OR DELETE ON "parametro_historial"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();
CREATE TRIGGER "parametro_historial_sin_vaciado" BEFORE TRUNCATE ON "parametro_historial"
  FOR EACH STATEMENT EXECUTE FUNCTION "rechazar_modificacion"();
REVOKE UPDATE, DELETE ON "parametro_historial" FROM rm_api, rm_admin;

-- La API no escribe parámetros; la administración solo cambia el valor de los editables, sin crear ni borrar
REVOKE INSERT, UPDATE, DELETE ON "parametro" FROM rm_api;
REVOKE INSERT, UPDATE, DELETE ON "parametro" FROM rm_admin;
GRANT UPDATE ("valor", "actualizado_en") ON "parametro" TO rm_admin;

CREATE FUNCTION "validar_cambio_parametro"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_regla "parametro_regla"%ROWTYPE;
  v_numero numeric;
BEGIN
  IF NOT (pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER')) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_regla FROM "parametro_regla" WHERE "clave" = NEW."clave";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este parámetro no se edita desde la administración' USING ERRCODE = 'RM036';
  END IF;
  BEGIN
    v_numero := NEW."valor"::numeric;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'El valor debe ser un número' USING ERRCODE = 'RM036';
  END;
  IF v_numero < v_regla."minimo" OR v_numero > v_regla."maximo" THEN
    RAISE EXCEPTION 'El valor está fuera del rango permitido (% a %)', v_regla."minimo", v_regla."maximo" USING ERRCODE = 'RM036';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "parametro_historial" h
     WHERE h."clave" = NEW."clave" AND h."tx_id" = txid_current() AND h."valor_nuevo" = NEW."valor" AND h."valor_anterior" = OLD."valor"
  ) THEN
    RAISE EXCEPTION 'Cambiar un parámetro exige su motivo en el historial' USING ERRCODE = 'RM036';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "parametro_validar" AFTER UPDATE OF "valor" ON "parametro"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."valor" IS DISTINCT FROM NEW."valor")
  EXECUTE FUNCTION "validar_cambio_parametro"();

-- Ciudades: se activa solo con sus requisitos y la lista de espera se avisa una sola vez
ALTER TABLE "lista_espera_ciudad" ADD COLUMN "avisada_en" TIMESTAMPTZ(3);
REVOKE INSERT, UPDATE, DELETE ON "ciudad", "zona" FROM rm_api;

CREATE FUNCTION "validar_activacion_ciudad"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."estado" = 'ACTIVA' AND OLD."estado" <> 'ACTIVA' AND pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER') THEN
    IF NOT EXISTS (SELECT 1 FROM "zona" z WHERE z."ciudad_id" = NEW."id")
       OR NOT NEW."verificadores_asignados" OR NOT NEW."precios_base_cargados" THEN
      RAISE EXCEPTION 'Una ciudad se activa con zonas, verificadores asignados y precios base cargados' USING ERRCODE = 'RM037';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "auditoria" a WHERE a."tx_id" = txid_current() AND a."tipo" = 'CIUDADES' AND a."accion" = 'ACTIVAR'
         AND a."entidad_id" = NEW."id"::text AND length(a."motivo") >= 5
    ) THEN
      RAISE EXCEPTION 'Activar una ciudad exige su motivo en la auditoría' USING ERRCODE = 'RM037';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ciudad_activacion_validar" AFTER UPDATE OF "estado" ON "ciudad"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."estado" IS DISTINCT FROM NEW."estado")
  EXECUTE FUNCTION "validar_activacion_ciudad"();

-- Premios: un premio ganado no se borra y su tipo no cambia; el catálogo de la administración suma 100 % y deja su constancia
REVOKE DELETE ON "premio" FROM rm_admin;

CREATE FUNCTION "proteger_premio_ganado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."tipo", NEW."puntos", NEW."nombre") IS DISTINCT FROM (OLD."tipo", OLD."puntos", OLD."nombre")
     AND EXISTS (SELECT 1 FROM "sorteo_ruleta" s WHERE s."premio_id" = OLD."id") THEN
    RAISE EXCEPTION 'Un premio que ya salió no cambia de nombre, tipo ni puntos: se desactiva y se crea otro' USING ERRCODE = 'RM038';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "premio_proteger" BEFORE UPDATE ON "premio" FOR EACH ROW EXECUTE FUNCTION "proteger_premio_ganado"();

CREATE FUNCTION "validar_catalogo_premios"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric;
  v_sin integer;
BEGIN
  IF NOT (pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER')) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "auditoria" a WHERE a."tx_id" = txid_current() AND a."tipo" = 'PREMIOS' AND length(a."motivo") >= 5
  ) THEN
    RAISE EXCEPTION 'Cambiar el catálogo de premios exige su motivo en la auditoría' USING ERRCODE = 'RM039';
  END IF;
  SELECT COALESCE(sum("probabilidad"), 0), count(*) FILTER (WHERE "tipo" = 'SIN_PREMIO') INTO v_total, v_sin
    FROM "premio" WHERE "activo";
  IF v_total <> 100 OR v_sin <> 1 THEN
    RAISE EXCEPTION 'Los premios activos deben sumar exactamente 100 %% e incluir un solo «Sigue intentando» (suman %)', v_total USING ERRCODE = 'RM039';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "premio_catalogo_validar" AFTER INSERT OR UPDATE ON "premio"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validar_catalogo_premios"();

-- Entregar un premio: solo la administración, con su constancia en la misma operación
CREATE FUNCTION "validar_entrega_premio"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT EXISTS (
    SELECT 1 FROM "auditoria" a WHERE a."tx_id" = txid_current() AND a."tipo" = 'PREMIOS' AND a."accion" = 'ENTREGAR'
       AND a."entidad_id" = NEW."id"::text
  ) THEN
    RAISE EXCEPTION 'Marcar un premio como entregado exige su constancia en la auditoría' USING ERRCODE = 'RM039';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "premio_ganado_entrega_validar" AFTER UPDATE OF "estado" ON "premio_ganado"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."estado" = 'ENTREGADO' AND OLD."estado" IS DISTINCT FROM NEW."estado")
  EXECUTE FUNCTION "validar_entrega_premio"();
