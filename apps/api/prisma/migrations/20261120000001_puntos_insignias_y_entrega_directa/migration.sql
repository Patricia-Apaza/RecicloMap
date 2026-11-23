-- Fase 10A: libro de puntos de solo agregar, nivel automático, entrega directa y retroalimentación del historial

ALTER TYPE "puntos_motivo" ADD VALUE IF NOT EXISTS 'CORRECCION';
ALTER TYPE "notificacion_tipo" ADD VALUE IF NOT EXISTS 'NIVEL';

-- Entrega directa: vence a los 7 días sin dar puntos y guarda cuántos puntos se otorgaron
ALTER TABLE "registro_reciclaje"
  ADD COLUMN "vence_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now() + INTERVAL '7 days',
  ADD COLUMN "puntos_otorgados" INTEGER NOT NULL DEFAULT 0;
UPDATE "registro_reciclaje" SET "vence_en" = "creado_en" + INTERVAL '7 days';
CREATE INDEX "registro_reciclaje_vencimiento_idx" ON "registro_reciclaje" ("estado", "vence_en");
CREATE INDEX "registro_reciclaje_reciclador_creado_idx" ON "registro_reciclaje" ("reciclador_id", "creado_en");

-- Historial: cada operación completada sin movimiento genera sus puntos con la fecha de su cierre
INSERT INTO "movimiento_puntos" ("usuario_id", "puntos", "motivo", "cuenta_para_giros", "operacion_id", "creado_en")
SELECT o."reciclador_id",
       floor(o."kg_final" * parametro_numerico('puntos_por_kg', 1))::int,
       'OPERACION', true, o."id", COALESCE(o."completada_en", now())
  FROM "operacion" o
 WHERE o."estado" = 'COMPLETADA'
   AND o."kg_final" IS NOT NULL
   AND floor(o."kg_final" * parametro_numerico('puntos_por_kg', 1)) > 0
ON CONFLICT ("operacion_id", "motivo") DO NOTHING;

-- Giros pendientes de registrar por los puntos de reciclaje (se acumulan; la pantalla los muestra en la 10B)
INSERT INTO "giro" ("usuario_id", "origen", "numero")
SELECT t."usuario_id", 'PUNTOS', n.n
  FROM (
    SELECT "usuario_id", floor(sum("puntos") / parametro_numerico('puntos_por_giro', 500))::int AS giros
      FROM "movimiento_puntos" WHERE "cuenta_para_giros" GROUP BY "usuario_id"
  ) t
  CROSS JOIN LATERAL generate_series(1, t.giros) AS n(n)
ON CONFLICT ("usuario_id", "origen", "numero") DO NOTHING;

-- Totales del perfil a partir del libro y de lo completado
UPDATE "reciclador_perfil" p
   SET "kg_total" = COALESCE((SELECT sum(o."kg_final") FROM "operacion" o
                               WHERE o."reciclador_id" = p."usuario_id" AND o."estado" = 'COMPLETADA'), 0)
                  + COALESCE((SELECT sum(r."kg_confirmado") FROM "registro_reciclaje" r
                               WHERE r."reciclador_id" = p."usuario_id" AND r."estado" = 'CONFIRMADO'), 0),
       "puntos" = COALESCE((SELECT sum(m."puntos") FROM "movimiento_puntos" m WHERE m."usuario_id" = p."usuario_id"), 0),
       "puntos_reciclaje" = COALESCE((SELECT sum(m."puntos") FROM "movimiento_puntos" m
                                      WHERE m."usuario_id" = p."usuario_id" AND m."cuenta_para_giros"), 0),
       "operaciones_completadas" = (SELECT count(*) FROM "operacion" o
                                     WHERE o."reciclador_id" = p."usuario_id" AND o."estado" = 'COMPLETADA');
UPDATE "reciclador_perfil" p
   SET "nivel_id" = (SELECT n."id" FROM "nivel" n WHERE n."kg_min" <= p."kg_total" ORDER BY n."kg_min" DESC LIMIT 1);

-- El nivel sale siempre de los kilos reales: nadie lo fija a mano
CREATE FUNCTION "nivel_por_kilos"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT n."id" INTO NEW."nivel_id" FROM "nivel" n WHERE n."kg_min" <= NEW."kg_total" ORDER BY n."kg_min" DESC LIMIT 1;
  RETURN NEW;
END $$;
CREATE TRIGGER "reciclador_perfil_nivel" BEFORE INSERT OR UPDATE OF "kg_total", "nivel_id" ON "reciclador_perfil"
  FOR EACH ROW EXECUTE FUNCTION "nivel_por_kilos"();

-- Todo movimiento debe tener un hecho que lo justifique; así ni el cliente ni la administración inventan puntos
CREATE FUNCTION "validar_movimiento_puntos"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_op "operacion"%ROWTYPE;
  v_reg "registro_reciclaje"%ROWTYPE;
  v_desafio "desafio"%ROWTYPE;
  v_dia date;
  v_otorgado int;
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
    IF NOT EXISTS (SELECT 1 FROM "invitacion" i WHERE i."invitador_id" = NEW."usuario_id"
                    AND i."invitado_id" = NEW."invitado_id" AND i."contada_en" IS NOT NULL) THEN
      RAISE EXCEPTION 'Los puntos de una invitación solo se otorgan cuando el invitado completa su primera operación' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'RULETA' THEN
    IF NEW."sorteo_id" IS NULL THEN
      RAISE EXCEPTION 'Los puntos de la ruleta salen de un sorteo' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."motivo" = 'CORRECCION' THEN
    IF NEW."operacion_id" IS NULL AND NEW."registro_id" IS NULL THEN
      RAISE EXCEPTION 'Una corrección debe apuntar a la operación o entrega que la origina' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "movimiento_puntos_validar" BEFORE INSERT ON "movimiento_puntos"
  FOR EACH ROW EXECUTE FUNCTION "validar_movimiento_puntos"();

-- El saldo del perfil es siempre la suma del libro; se comprueba al cerrar la transacción
CREATE FUNCTION "validar_saldo_puntos"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
  v_reciclaje int;
BEGIN
  SELECT COALESCE(sum("puntos"), 0), COALESCE(sum("puntos") FILTER (WHERE "cuenta_para_giros"), 0)
    INTO v_total, v_reciclaje FROM "movimiento_puntos" WHERE "usuario_id" = NEW."usuario_id";
  IF NEW."puntos" <> v_total OR NEW."puntos_reciclaje" <> v_reciclaje THEN
    RAISE EXCEPTION 'El saldo de puntos debe coincidir con el libro de movimientos' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "reciclador_perfil_saldo" AFTER INSERT OR UPDATE OF "puntos", "puntos_reciclaje" ON "reciclador_perfil"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validar_saldo_puntos"();

-- La administración no escribe en el juego; solo puede cerrar una operación en disputa, que genera sus puntos por el libro
REVOKE INSERT, UPDATE, DELETE ON "registro_reciclaje", "usuario_insignia", "usuario_desafio", "desafio" FROM rm_admin;
REVOKE UPDATE, DELETE ON "giro" FROM rm_admin;
REVOKE DELETE ON "movimiento_puntos" FROM rm_api, rm_admin;

-- La pantalla de desafíos no habla de giros hasta la ruleta (Fase 10B)
UPDATE "plantilla_desafio" SET "descripcion" = 'Suma 100 kg en operaciones completadas o entregas directas confirmadas.'
 WHERE "codigo" = 'meta_del_mes';

-- Parámetros nuevos, editables desde administración
INSERT INTO "parametro" ("clave", "valor", "descripcion") VALUES
  ('desafio_reclamo_dias', '7', 'Días tras terminar el mes para reclamar un desafío completado'),
  ('ranking_max_filas', '20', 'Filas visibles del ranking')
ON CONFLICT ("clave") DO NOTHING;
