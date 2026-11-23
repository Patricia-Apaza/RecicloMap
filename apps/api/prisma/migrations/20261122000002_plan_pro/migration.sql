-- Fase 11: plan Pro. Solo la administración lo activa, con fechas y motivo; el vencimiento lo hace el sistema.

CREATE TYPE "plan_accion" AS ENUM ('ACTIVADO', 'DESACTIVADO', 'VENCIDO');

ALTER TABLE "solicitud_plan"
  ADD COLUMN "mensaje" VARCHAR(200),
  ADD COLUMN "motivo_decision" VARCHAR(200),
  ADD COLUMN "decidida_por_id" UUID,
  ADD COLUMN "desde" DATE,
  ADD COLUMN "hasta" DATE,
  ADD CONSTRAINT "solicitud_plan_decidida_por_fkey" FOREIGN KEY ("decidida_por_id") REFERENCES "usuario"("id"),
  ADD CONSTRAINT "solicitud_plan_aprobada_con_fechas" CHECK (
    "estado" <> 'APROBADA' OR ("desde" IS NOT NULL AND "hasta" IS NOT NULL AND "desde" <= "hasta" AND "decidida_por_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "solicitud_plan_rechazo_con_motivo" CHECK (
    "estado" <> 'RECHAZADA' OR ("motivo_decision" IS NOT NULL AND length("motivo_decision") >= 5 AND "decidida_por_id" IS NOT NULL)
  );

-- Una sola solicitud pendiente por negocio
CREATE UNIQUE INDEX "solicitud_plan_una_pendiente" ON "solicitud_plan"("comprador_id") WHERE "estado" = 'PENDIENTE';

-- Historial del plan de cada negocio: solo se agrega y se lee
CREATE TABLE "plan_historial" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "comprador_id" UUID NOT NULL,
  "accion" "plan_accion" NOT NULL,
  "desde" DATE,
  "hasta" DATE,
  "motivo" VARCHAR(200) NOT NULL,
  "admin_id" UUID,
  "solicitud_id" UUID,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tx_id" BIGINT NOT NULL DEFAULT txid_current(),
  CONSTRAINT "plan_historial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_historial_comprador_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE,
  CONSTRAINT "plan_historial_admin_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id"),
  CONSTRAINT "plan_historial_solicitud_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud_plan"("id") ON DELETE SET NULL,
  CONSTRAINT "plan_historial_motivo" CHECK (length("motivo") >= 5),
  CONSTRAINT "plan_historial_activado_con_fechas" CHECK ("accion" <> 'ACTIVADO' OR ("desde" IS NOT NULL AND "hasta" IS NOT NULL AND "desde" <= "hasta")),
  CONSTRAINT "plan_historial_admin_decide" CHECK ("accion" = 'VENCIDO' OR "admin_id" IS NOT NULL)
);
CREATE INDEX "plan_historial_comprador_id_creado_en_idx" ON "plan_historial"("comprador_id", "creado_en");

CREATE TRIGGER "plan_historial_inmutable" BEFORE UPDATE OR DELETE ON "plan_historial"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_modificacion"();
CREATE TRIGGER "plan_historial_sin_vaciado" BEFORE TRUNCATE ON "plan_historial"
  FOR EACH STATEMENT EXECUTE FUNCTION "rechazar_modificacion"();
REVOKE UPDATE, DELETE ON "plan_historial" FROM rm_api, rm_admin;

ALTER TABLE "comprador" ADD COLUMN "plan_aviso_en" TIMESTAMPTZ(3);
-- La administración ya solo escribe el plan y sus fechas (más verificación y dirección); reiniciar el aviso es parte del plan
GRANT UPDATE ("plan_aviso_en") ON "comprador" TO rm_admin;

-- Cambiar el plan exige una constancia con motivo en la misma operación; el negocio y la API solo pueden dejarlo vencer
CREATE FUNCTION "validar_cambio_plan"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_api boolean := pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_admin', 'MEMBER');
  v_admin boolean := pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER');
BEGIN
  IF v_api THEN
    IF NOT (
      OLD."plan" = 'PRO' AND NEW."plan" = 'GRATIS'
      AND NEW."plan_desde" IS NOT DISTINCT FROM OLD."plan_desde" AND NEW."plan_hasta" IS NOT DISTINCT FROM OLD."plan_hasta"
      AND EXISTS (SELECT 1 FROM "plan_historial" h WHERE h."comprador_id" = NEW."id" AND h."accion" = 'VENCIDO' AND h."tx_id" = txid_current())
    ) THEN
      RAISE EXCEPTION 'Solo la administración cambia el plan de un negocio' USING ERRCODE = 'RM033';
    END IF;
  ELSIF v_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM "plan_historial" h WHERE h."comprador_id" = NEW."id" AND h."tx_id" = txid_current() AND h."admin_id" IS NOT NULL
        AND h."accion" = CASE WHEN NEW."plan" = 'PRO' THEN 'ACTIVADO'::plan_accion ELSE 'DESACTIVADO'::plan_accion END
    ) THEN
      RAISE EXCEPTION 'Cambiar el plan exige su motivo en el historial' USING ERRCODE = 'RM033';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "comprador_plan_validar" AFTER UPDATE ON "comprador"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD."plan" IS DISTINCT FROM NEW."plan" OR OLD."plan_desde" IS DISTINCT FROM NEW."plan_desde" OR OLD."plan_hasta" IS DISTINCT FROM NEW."plan_hasta")
  EXECUTE FUNCTION "validar_cambio_plan"();

-- Cada decisión sobre una solicitud la toma quien corresponde: el negocio solo la cancela y la administración la aprueba o rechaza
CREATE FUNCTION "transicion_solicitud_plan"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_api boolean := pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_admin', 'MEMBER');
  v_admin boolean := pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER');
BEGIN
  IF (NEW."id", NEW."comprador_id", NEW."mensaje", NEW."creada_en") IS DISTINCT FROM (OLD."id", OLD."comprador_id", OLD."mensaje", OLD."creada_en") THEN
    RAISE EXCEPTION 'La solicitud no se modifica' USING ERRCODE = 'RM030';
  END IF;
  IF OLD."estado" <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta' USING ERRCODE = 'RM030';
  END IF;
  IF NEW."estado" = 'CANCELADA' AND v_admin THEN
    RAISE EXCEPTION 'Solo el negocio cancela su solicitud' USING ERRCODE = 'RM032';
  END IF;
  IF NEW."estado" IN ('APROBADA', 'RECHAZADA') AND v_api THEN
    RAISE EXCEPTION 'Solo administración decide una solicitud' USING ERRCODE = 'RM032';
  END IF;
  NEW."atendida_en" := now();
  RETURN NEW;
END $$;
CREATE TRIGGER "solicitud_plan_transicion" BEFORE UPDATE OF "estado" ON "solicitud_plan"
  FOR EACH ROW WHEN (OLD."estado" IS DISTINCT FROM NEW."estado") EXECUTE FUNCTION "transicion_solicitud_plan"();

-- Parámetros nuevos, editables desde administración
INSERT INTO "parametro" ("clave", "valor", "descripcion") VALUES
  ('plan_aviso_vence_dias', '7', 'Días antes del fin del plan Pro en que se avisa al negocio'),
  ('recomendado_ventaja_pro_m', '500', 'Metros de ventaja que el plan Pro suma en el orden Recomendado (nunca en otro orden)')
ON CONFLICT ("clave") DO NOTHING;
