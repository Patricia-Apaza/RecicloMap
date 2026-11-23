-- Fase 12A: administración de usuarios, avisos y auditoría. La administración decide con motivo y constancia; no edita datos ajenos.

-- La constancia de auditoría queda atada a la transacción que la originó
ALTER TABLE "auditoria" ADD COLUMN "tx_id" BIGINT NOT NULL DEFAULT txid_current();
CREATE INDEX "auditoria_admin_id_creada_en_idx" ON "auditoria"("admin_id", "creada_en");
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- Suspensión de cuentas
ALTER TABLE "usuario"
  ADD COLUMN "suspendido_en" TIMESTAMPTZ(3),
  ADD COLUMN "suspendido_por_id" UUID,
  ADD CONSTRAINT "usuario_suspendido_por_fkey" FOREIGN KEY ("suspendido_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL;

-- La administración solo escribe la situación de la cuenta: nunca el nombre, el teléfono, el correo, la ciudad ni la contraseña
REVOKE INSERT, UPDATE, DELETE ON "usuario" FROM rm_admin;
GRANT UPDATE ("estado", "motivo_suspension", "suspendido_en", "suspendido_por_id", "actualizado_en") ON "usuario" TO rm_admin;

CREATE FUNCTION "validar_cambio_estado_usuario"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_api boolean := pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_admin', 'MEMBER');
  v_admin boolean := pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER');
  v_accion text;
BEGIN
  IF NOT (NEW."estado" = 'SUSPENDIDO' OR OLD."estado" = 'SUSPENDIDO' OR v_admin) THEN
    RETURN NULL;
  END IF;
  IF v_api THEN
    RAISE EXCEPTION 'Solo la administración suspende o reactiva una cuenta' USING ERRCODE = 'RM034';
  END IF;
  IF v_admin THEN
    v_accion := CASE WHEN OLD."estado" = 'ACTIVO' AND NEW."estado" = 'SUSPENDIDO' THEN 'SUSPENDER'
                     WHEN OLD."estado" = 'SUSPENDIDO' AND NEW."estado" = 'ACTIVO' THEN 'REACTIVAR' END;
    IF v_accion IS NULL THEN
      RAISE EXCEPTION 'La administración solo suspende una cuenta activa o reactiva una suspendida' USING ERRCODE = 'RM034';
    END IF;
    IF NEW."rol" = 'ADMIN' THEN
      RAISE EXCEPTION 'Una cuenta de administración no se suspende desde aquí' USING ERRCODE = 'RM034';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "auditoria" a
       WHERE a."tx_id" = txid_current() AND a."tipo" = 'USUARIOS' AND a."entidad" = 'usuario'
         AND a."entidad_id" = NEW."id"::text AND a."accion" = v_accion AND length(a."motivo") >= 5
    ) THEN
      RAISE EXCEPTION 'Cambiar la situación de una cuenta exige su motivo en la auditoría' USING ERRCODE = 'RM034';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "usuario_estado_validar" AFTER UPDATE OF "estado" ON "usuario"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."estado" IS DISTINCT FROM NEW."estado")
  EXECUTE FUNCTION "validar_cambio_estado_usuario"();

-- Moderación de avisos: se oculta con motivo, no se edita
ALTER TABLE "aviso"
  ADD COLUMN "motivo_oculto" VARCHAR(200),
  ADD COLUMN "oculto_por_id" UUID,
  ADD COLUMN "oculto_en" TIMESTAMPTZ(3),
  ADD CONSTRAINT "aviso_oculto_por_fkey" FOREIGN KEY ("oculto_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "aviso_oculto_con_motivo" CHECK ("estado" <> 'OCULTO' OR ("motivo_oculto" IS NOT NULL AND length("motivo_oculto") >= 5 AND "oculto_por_id" IS NOT NULL));
GRANT UPDATE ("estado", "motivo_oculto", "oculto_por_id", "oculto_en") ON "aviso" TO rm_admin;

CREATE FUNCTION "validar_moderacion_aviso"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_api boolean := pg_has_role(current_user, 'rm_api', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_admin', 'MEMBER');
  v_admin boolean := pg_has_role(current_user, 'rm_admin', 'MEMBER') AND NOT pg_has_role(current_user, 'rm_api', 'MEMBER');
  v_accion text;
BEGIN
  IF v_api THEN
    RAISE EXCEPTION 'Solo la administración oculta o restituye un aviso' USING ERRCODE = 'RM035';
  END IF;
  IF v_admin THEN
    v_accion := CASE WHEN NEW."estado" = 'OCULTO' THEN 'OCULTAR' ELSE 'RESTITUIR' END;
    IF NOT EXISTS (
      SELECT 1 FROM "auditoria" a
       WHERE a."tx_id" = txid_current() AND a."tipo" = 'AVISOS' AND a."entidad" = 'aviso'
         AND a."entidad_id" = NEW."id"::text AND a."accion" = v_accion AND length(a."motivo") >= 5
    ) THEN
      RAISE EXCEPTION 'Moderar un aviso exige su motivo en la auditoría' USING ERRCODE = 'RM035';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "aviso_moderacion_validar" AFTER UPDATE OF "estado" ON "aviso"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."estado" IS DISTINCT FROM NEW."estado")
  EXECUTE FUNCTION "validar_moderacion_aviso"();

-- Las publicaciones de una cuenta suspendida no se ofrecen a los negocios; vuelven solas al reactivar
CREATE OR REPLACE FUNCTION "publicaciones_cercanas"(p_comprador uuid)
RETURNS TABLE ("publicacion_id" uuid, "tramo" "tramo_distancia")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p."id", tramo_de_metros(ST_Distance(pu."ubicacion", ref."punto"))
    FROM "comprador" c
    JOIN "usuario" u ON u."id" = c."usuario_id"
    CROSS JOIN LATERAL (SELECT comprador_punto_referencia(c."id") AS "punto") ref
    CROSS JOIN LATERAL (SELECT parametro_numerico('radio_visibilidad_km', 0) AS "km") radio
    JOIN "publicacion" p ON p."ciudad_id" = u."ciudad_id"
    JOIN "usuario" ur ON ur."id" = p."reciclador_id" AND ur."estado" = 'ACTIVO'
    JOIN "publicacion_ubicacion" pu ON pu."publicacion_id" = p."id"
   WHERE c."id" = p_comprador
     AND c."estado_verificacion" = 'APROBADO'
     AND u."estado" = 'ACTIVO'
     AND p."estado" IN ('DISPONIBLE', 'CON_OFERTAS')
     AND p."vence_en" > now()
     AND (radio."km" <= 0 OR ST_DWithin(pu."ubicacion", ref."punto", radio."km" * 1000))
   ORDER BY ST_Distance(pu."ubicacion", ref."punto"), p."creada_en" DESC;
$$;
