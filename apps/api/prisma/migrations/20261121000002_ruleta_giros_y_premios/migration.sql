-- Fase 10B: giros, ruleta y premios. Todo lo que otorga o gasta algo lo valida la base de datos.

-- Campaña de cada premio y datos del giro para poder auditarlo
ALTER TABLE "premio"
  ADD COLUMN "vigente_desde" TIMESTAMPTZ(3),
  ADD COLUMN "vigente_hasta" TIMESTAMPTZ(3),
  ADD CONSTRAINT "premio_campana" CHECK ("vigente_desde" IS NULL OR "vigente_hasta" IS NULL OR "vigente_desde" < "vigente_hasta");

ALTER TABLE "sorteo_ruleta"
  ADD COLUMN "clave_solicitud" VARCHAR(64),
  ADD COLUMN "instantanea" JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX "sorteo_ruleta_usuario_id_clave_solicitud_key" ON "sorteo_ruleta"("usuario_id", "clave_solicitud");

ALTER TABLE "premio_ganado"
  ADD COLUMN "reclamado_en" TIMESTAMPTZ(3),
  ADD COLUMN "aviso_vence_en" TIMESTAMPTZ(3),
  ADD CONSTRAINT "premio_ganado_entrega" CHECK ("estado" <> 'ENTREGADO' OR "entregado_en" IS NOT NULL);

-- Un giro nace de puntos por reciclaje o de la Meta del mes reclamada; nadie lo agrega a mano
CREATE FUNCTION "validar_giro"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_puntos int;
BEGIN
  IF NEW."origen" = 'PUNTOS' THEN
    SELECT "puntos_reciclaje" INTO v_puntos FROM "reciclador_perfil" WHERE "usuario_id" = NEW."usuario_id";
    IF NOT FOUND OR NEW."numero" > floor(v_puntos / parametro_numerico('puntos_por_giro', 500)) THEN
      RAISE EXCEPTION 'Un giro por puntos exige haber reunido los puntos de reciclaje que lo dan' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM "usuario_desafio" ud JOIN "desafio" d ON d."id" = ud."desafio_id"
     WHERE ud."usuario_id" = NEW."usuario_id" AND ud."desafio_id" = NEW."desafio_id"
       AND ud."reclamado_en" IS NOT NULL AND d."es_meta_mes"
  ) THEN
    RAISE EXCEPTION 'El giro de la Meta del mes exige haberla reclamado' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "giro_validar" AFTER INSERT ON "giro"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validar_giro"();

-- Un giro solo cambia al gastarse, una vez, y nunca se borra
CREATE FUNCTION "proteger_giro"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."usado_en" IS NOT NULL OR NEW."usado_en" IS NULL
     OR (NEW."id", NEW."usuario_id", NEW."origen", NEW."numero", NEW."desafio_id", NEW."creado_en")
        IS DISTINCT FROM (OLD."id", OLD."usuario_id", OLD."origen", OLD."numero", OLD."desafio_id", OLD."creado_en") THEN
    RAISE EXCEPTION 'Un giro solo se marca como usado, una vez' USING ERRCODE = 'RM030';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "giro_proteger" BEFORE UPDATE ON "giro"
  FOR EACH ROW EXECUTE FUNCTION "proteger_giro"();
REVOKE DELETE ON "giro" FROM rm_api, rm_admin;

-- El sorteo descuenta el stock en la misma operación; sin stock o fuera de campaña el premio no puede salir
CREATE FUNCTION "aplicar_sorteo"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_premio "premio"%ROWTYPE;
BEGIN
  SELECT * INTO v_premio FROM "premio" WHERE "id" = NEW."premio_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El premio del sorteo no existe' USING ERRCODE = '23514';
  END IF;
  IF v_premio."tipo" <> 'SIN_PREMIO' THEN
    IF NOT v_premio."activo"
       OR (v_premio."vigente_desde" IS NOT NULL AND NEW."creado_en" < v_premio."vigente_desde")
       OR (v_premio."vigente_hasta" IS NOT NULL AND NEW."creado_en" >= v_premio."vigente_hasta") THEN
      RAISE EXCEPTION 'Un premio inactivo o fuera de su campaña no puede salir' USING ERRCODE = '23514';
    END IF;
    IF v_premio."stock" IS NOT NULL THEN
      UPDATE "premio" SET "stock" = "stock" - 1 WHERE "id" = v_premio."id";
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "sorteo_ruleta_aplicar" BEFORE INSERT ON "sorteo_ruleta"
  FOR EACH ROW EXECUTE FUNCTION "aplicar_sorteo"();
REVOKE ALL ON FUNCTION "aplicar_sorteo"() FROM PUBLIC;

-- Bloquea el premio y devuelve su stock; la API no puede bloquear filas de premio sin poder editarlas
CREATE FUNCTION "stock_del_premio_bloqueado"(p_id uuid) RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT "stock" FROM "premio" WHERE "id" = p_id FOR UPDATE
$$;
REVOKE ALL ON FUNCTION "stock_del_premio_bloqueado"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "stock_del_premio_bloqueado"(uuid) TO rm_api;

-- Un sorteo gasta exactamente un giro propio de una cuenta activa con teléfono verificado
CREATE FUNCTION "validar_sorteo"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "giro" g WHERE g."id" = NEW."giro_id" AND g."usuario_id" = NEW."usuario_id" AND g."usado_en" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El sorteo debe gastar un giro propio' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "usuario" u WHERE u."id" = NEW."usuario_id" AND u."estado" = 'ACTIVO' AND u."telefono_verificado_en" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Solo gira una cuenta activa con teléfono verificado' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "sorteo_ruleta_validar" AFTER INSERT ON "sorteo_ruleta"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validar_sorteo"();

-- El premio ganado nace del sorteo de un premio con objeto
CREATE FUNCTION "validar_premio_ganado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "sorteo_ruleta" s JOIN "premio" p ON p."id" = s."premio_id"
     WHERE s."id" = NEW."sorteo_id" AND s."usuario_id" = NEW."usuario_id" AND s."premio_id" = NEW."premio_id" AND p."tipo" = 'OBJETO'
  ) THEN
    RAISE EXCEPTION 'Un premio ganado sale del sorteo de un premio con objeto' USING ERRCODE = '23514';
  END IF;
  IF NEW."vence_en" <= NEW."creado_en" THEN
    RAISE EXCEPTION 'El plazo para reclamar debe ser posterior al sorteo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "premio_ganado_validar" BEFORE INSERT ON "premio_ganado"
  FOR EACH ROW EXECUTE FUNCTION "validar_premio_ganado"();

-- Ganado (POR_RECLAMAR) → RECLAMADO → ENTREGADO, o VENCIDO si no se reclama a tiempo; ENTREGADO solo lo marca administración
CREATE FUNCTION "transicion_premio_ganado"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."sorteo_id", NEW."usuario_id", NEW."premio_id", NEW."codigo", NEW."punto_entrega", NEW."vence_en", NEW."creado_en")
     IS DISTINCT FROM (OLD."id", OLD."sorteo_id", OLD."usuario_id", OLD."premio_id", OLD."codigo", OLD."punto_entrega", OLD."vence_en", OLD."creado_en") THEN
    RAISE EXCEPTION 'Los datos del premio ganado no se modifican' USING ERRCODE = 'RM030';
  END IF;
  IF NEW."estado" = OLD."estado" THEN
    IF (NEW."reclamado_en", NEW."entregado_en") IS DISTINCT FROM (OLD."reclamado_en", OLD."entregado_en") THEN
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
    IF pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_admin', 'MEMBER') THEN
      RAISE EXCEPTION 'Solo administración marca un premio como entregado' USING ERRCODE = 'RM032';
    END IF;
    NEW."entregado_en" := now();
  ELSIF OLD."estado" = 'POR_RECLAMAR' AND NEW."estado" = 'VENCIDO' THEN
    IF now() < OLD."vence_en" THEN
      RAISE EXCEPTION 'El premio aún está dentro de su plazo' USING ERRCODE = 'RM031';
    END IF;
  ELSE
    RAISE EXCEPTION 'Transición de premio no permitida: % → %', OLD."estado", NEW."estado" USING ERRCODE = 'RM030';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "premio_ganado_transicion" BEFORE UPDATE ON "premio_ganado"
  FOR EACH ROW EXECUTE FUNCTION "transicion_premio_ganado"();
REVOKE DELETE ON "premio_ganado" FROM rm_api, rm_admin;

-- La API solo lee los premios; su stock lo mueve el sorteo y la administración lo edita con su conexión
REVOKE INSERT, UPDATE, DELETE ON "premio" FROM rm_api;
REVOKE INSERT ON "sorteo_ruleta" FROM rm_admin;

-- Los puntos de la ruleta salen de un sorteo propio con premio de puntos; las invitaciones pagan a quien invita y al invitado
CREATE OR REPLACE FUNCTION "validar_movimiento_puntos"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_op "operacion"%ROWTYPE;
  v_reg "registro_reciclaje"%ROWTYPE;
  v_desafio "desafio"%ROWTYPE;
  v_dia date;
  v_otorgado int;
  v_premio "premio"%ROWTYPE;
BEGIN
  IF NEW."motivo" = 'OPERACION' THEN
    SELECT * INTO v_op FROM "operacion" WHERE "id" = NEW."operacion_id";
    IF NOT FOUND OR v_op."estado" <> 'COMPLETADA' OR v_op."reciclador_id" <> NEW."usuario_id"
       OR NEW."puntos" <> floor(v_op."kg_final" * parametro_numerico('puntos_por_kg', 1))::int THEN
      RAISE EXCEPTION 'Los puntos de una operación solo se otorgan al completarla (1 por kg)' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'REGISTRO_DIRECTO' THEN
    SELECT * INTO v_reg FROM "registro_reciclaje" WHERE "id" = NEW."registro_id";
    IF NOT FOUND OR v_reg."estado" <> 'CONFIRMADO' OR v_reg."reciclador_id" <> NEW."usuario_id"
       OR NEW."puntos" > floor(v_reg."kg_confirmado" * parametro_numerico('puntos_por_kg', 1))::int THEN
      RAISE EXCEPTION 'Los puntos de una entrega directa solo se otorgan al confirmarla' USING ERRCODE = '23514';
    END IF;
    v_dia := (NEW."creado_en" AT TIME ZONE 'America/Lima')::date;
    SELECT COALESCE(sum("puntos"), 0) INTO v_otorgado FROM "movimiento_puntos"
     WHERE "usuario_id" = NEW."usuario_id" AND "motivo" = 'REGISTRO_DIRECTO'
       AND (("creado_en" AT TIME ZONE 'America/Lima')::date) = v_dia;
    IF v_otorgado + NEW."puntos" > parametro_numerico('tope_diario_registro_directo', 150) THEN
      RAISE EXCEPTION 'Se superó el tope diario de puntos por entrega directa' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'DESAFIO' THEN
    SELECT d.* INTO v_desafio FROM "desafio" d
      JOIN "usuario_desafio" ud ON ud."desafio_id" = d."id"
     WHERE d."id" = NEW."desafio_id" AND ud."usuario_id" = NEW."usuario_id" AND ud."reclamado_en" IS NOT NULL;
    IF NOT FOUND OR NEW."puntos" <> v_desafio."puntos" THEN
      RAISE EXCEPTION 'Los puntos de un desafío solo se otorgan al reclamarlo' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'INVITACION' THEN
    IF NOT EXISTS (SELECT 1 FROM "invitacion" i WHERE i."invitado_id" = NEW."invitado_id" AND i."contada_en" IS NOT NULL
                    AND NEW."usuario_id" IN (i."invitador_id", i."invitado_id")) THEN
      RAISE EXCEPTION 'Los puntos de una invitación solo se otorgan cuando el invitado completa su primera operación' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'RULETA' THEN
    SELECT p.* INTO v_premio FROM "sorteo_ruleta" s JOIN "premio" p ON p."id" = s."premio_id"
     WHERE s."id" = NEW."sorteo_id" AND s."usuario_id" = NEW."usuario_id";
    IF NOT FOUND OR v_premio."tipo" <> 'PUNTOS' OR NEW."puntos" <> v_premio."puntos" THEN
      RAISE EXCEPTION 'Los puntos de la ruleta salen de un sorteo propio con premio de puntos' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'CORRECCION' THEN
    IF NEW."operacion_id" IS NULL AND NEW."registro_id" IS NULL THEN
      RAISE EXCEPTION 'Una corrección debe apuntar a la operación o entrega que la origina' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Parámetro nuevo y textos de la 10A ajustados
INSERT INTO "parametro" ("clave", "valor", "descripcion") VALUES
  ('premio_aviso_dias', '3', 'Días antes del vencimiento en que se avisa de un premio sin reclamar')
ON CONFLICT ("clave") DO NOTHING;

UPDATE "insignia" SET "descripcion" = 'Reclama al menos un desafío en 3 meses distintos.', "meta" = 3, "unidad" = 'meses'
 WHERE "codigo" = 'cazador_de_desafios';
UPDATE "insignia" SET "descripcion" = 'Verifica tu teléfono y empieza a reciclar.' WHERE "codigo" = 'semilla';
UPDATE "plantilla_desafio" SET "descripcion" = 'Suma 100 kg en operaciones completadas o entregas directas confirmadas. Da puntos de bono y un giro de la ruleta.'
 WHERE "codigo" = 'meta_del_mes';

-- Quien ya tenía una cuenta de reciclador con el teléfono verificado recibe Semilla
INSERT INTO "usuario_insignia" ("usuario_id", "insignia_id")
SELECT u."id", i."id" FROM "usuario" u JOIN "insignia" i ON i."codigo" = 'semilla'
 WHERE u."rol" = 'RECICLADOR' AND u."telefono_verificado_en" IS NOT NULL
ON CONFLICT DO NOTHING;
