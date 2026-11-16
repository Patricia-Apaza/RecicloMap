-- Fase 8: reportes, moderación, favoritos con alertas y reseñas ocultas

-- Una reseña oculta no se borra ni se edita: se marca aparte, con motivo y autor de la decisión
CREATE TABLE "resena_oculta" (
    "calificacion_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "motivo" VARCHAR(300) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resena_oculta_pkey" PRIMARY KEY ("calificacion_id"),
    CONSTRAINT "resena_oculta_calificacion_id_fkey" FOREIGN KEY ("calificacion_id") REFERENCES "calificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "resena_oculta_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
REVOKE INSERT, UPDATE, DELETE ON "resena_oculta" FROM rm_api;
REVOKE UPDATE, DELETE ON "resena_oculta" FROM rm_admin;

-- Alertas por favorito (pantalla 19): única vía de alertas de precio
ALTER TABLE "favorito"
  ADD COLUMN "alerta_precio" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "alerta_avisos" BOOLEAN NOT NULL DEFAULT true;

-- El plazo vencido avisa al administrador una sola vez; nunca suspende solo
ALTER TABLE "moderacion_precio" ADD COLUMN "plazo_avisado_en" TIMESTAMPTZ(3);
ALTER TABLE "reporte" ADD COLUMN "plazo_avisado_en" TIMESTAMPTZ(3);

-- La moderación de precios es del administrador: la API general no la escribe
REVOKE INSERT, UPDATE, DELETE ON "moderacion_precio" FROM rm_api;

-- Un mismo reciclador no repite un reporte abierto sobre el mismo negocio y motivo
CREATE UNIQUE INDEX "reporte_negocio_abierto_unico" ON "reporte" ("autor_id", "comprador_id", "motivo")
  WHERE "tipo" = 'NEGOCIO' AND "estado" IN ('PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA');

-- Umbrales iniciales de las alertas de posible colusión (solo avisan, no bloquean)
INSERT INTO "parametro" ("clave", "valor", "descripcion") VALUES
  ('colusion_operaciones_par_7_dias', '3', 'Operaciones completadas entre el mismo reciclador y negocio en 7 días que generan alerta'),
  ('colusion_desvio_peso_pct', '40', 'Diferencia porcentual entre kilos publicados y recibidos que genera alerta'),
  ('colusion_kg_operacion', '500', 'Kilos recibidos en una sola operación que generan alerta')
ON CONFLICT ("clave") DO NOTHING;

-- La reputación no cuenta las reseñas ocultas; se recalcula al calificar y al ocultar
CREATE FUNCTION "recalcular_reputacion"(p_destino uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prom numeric(3, 2);
  v_cant integer;
BEGIN
  SELECT COALESCE(round(avg(c."estrellas"), 2), 0), count(*) INTO v_prom, v_cant
    FROM "calificacion" c
   WHERE c."destino_id" = p_destino
     AND NOT EXISTS (SELECT 1 FROM "resena_oculta" o WHERE o."calificacion_id" = c."id");
  UPDATE "comprador" SET "calif_prom" = v_prom, "calif_cant" = v_cant WHERE "usuario_id" = p_destino;
  UPDATE "reciclador_perfil" SET "calif_prom" = v_prom, "calif_cant" = v_cant WHERE "usuario_id" = p_destino;
END $$;
REVOKE ALL ON FUNCTION "recalcular_reputacion"(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "calificacion_recalcular"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM "recalcular_reputacion"(NEW."destino_id");
  RETURN NEW;
END $$;

CREATE FUNCTION "resena_oculta_recalcular"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM "recalcular_reputacion"((SELECT "destino_id" FROM "calificacion" WHERE "id" = NEW."calificacion_id"));
  RETURN NEW;
END $$;

CREATE TRIGGER "resena_oculta_recalcular" AFTER INSERT ON "resena_oculta"
  FOR EACH ROW EXECUTE FUNCTION "resena_oculta_recalcular"();
