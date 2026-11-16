-- Fase 9: paneles del negocio (avisos, día del comprador móvil, alertas descartables)

-- Estado de moderación del aviso: lo usa la administración en la Fase 12
CREATE TYPE "aviso_estado" AS ENUM ('ACTIVO', 'OCULTO');
ALTER TABLE "aviso"
  ADD COLUMN "estado" "aviso_estado" NOT NULL DEFAULT 'ACTIVO',
  ADD CONSTRAINT "aviso_titulo_largo" CHECK (char_length("titulo") BETWEEN 3 AND 60),
  ADD CONSTRAINT "aviso_mensaje_largo" CHECK ("mensaje" IS NULL OR char_length("mensaje") <= 140);
CREATE INDEX "aviso_vigentes_idx" ON "aviso" ("vigente_hasta") WHERE "retirado_en" IS NULL;

-- Día del comprador móvil: todo lo "de hoy" caduca al terminar el día en Lima
ALTER TABLE "comprador"
  ADD COLUMN "dia_vigente" DATE,
  ADD COLUMN "comparte_posicion" BOOLEAN NOT NULL DEFAULT false;

-- Solo se muestra la posición aproximada si el móvil está en ruta y decidió compartirla hoy
CREATE OR REPLACE VIEW "v_mapa" AS
SELECT
  c."id" AS "comprador_id",
  c."tipo",
  c."nombre_comercial",
  (c."plan" = 'PRO' AND (now() AT TIME ZONE 'America/Lima')::date BETWEEN c."plan_desde" AND c."plan_hasta") AS "es_pro",
  c."calif_prom",
  c."calif_cant",
  -- «En ruta» caduca al terminar el día en Lima, aunque la tarea de limpieza aún no haya corrido
  (CASE WHEN c."disponibilidad" = 'EN_RUTA' AND c."dia_vigente" IS DISTINCT FROM (now() AT TIME ZONE 'America/Lima')::date
        THEN 'DISPONIBLE'::disponibilidad ELSE c."disponibilidad" END) AS "disponibilidad",
  c."zona_id",
  u."ciudad_id",
  COALESCE(
    c."ubicacion",
    CASE WHEN c."comparte_posicion" AND c."disponibilidad" = 'EN_RUTA' AND c."dia_vigente" = (now() AT TIME ZONE 'America/Lima')::date
         THEN c."posicion_aproximada" END,
    z."centro"
  )::geography(Point, 4326) AS "punto",
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

-- Alertas de posible colusión descartadas con motivo (nunca se borran)
CREATE TABLE "alerta_descartada" (
    "id" BIGSERIAL NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "clave" VARCHAR(80) NOT NULL,
    "motivo" VARCHAR(300) NOT NULL,
    "admin_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alerta_descartada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alerta_descartada_tipo" CHECK ("tipo" IN ('PAR', 'PESO')),
    CONSTRAINT "alerta_descartada_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "alerta_descartada_clave_idx" ON "alerta_descartada" ("tipo", "clave");
REVOKE INSERT, UPDATE, DELETE ON "alerta_descartada" FROM rm_api;
REVOKE UPDATE, DELETE ON "alerta_descartada" FROM rm_admin;

-- La administración no escribe nada de lo que pertenece al negocio: avisos, ruta, visitas ni solicitudes
REVOKE INSERT, UPDATE, DELETE ON "aviso", "parada_ruta", "evento_visita", "solicitud_llegada" FROM rm_admin;
REVOKE UPDATE ON "comprador" FROM rm_admin;
GRANT UPDATE ("estado_verificacion", "actualizado_en", "direccion", "zona_id", "ubicacion", "ubicacion_confirmada", "plan", "plan_desde", "plan_hasta")
  ON "comprador" TO rm_admin;

-- Parámetros editables (iguales para Gratis y Pro)
INSERT INTO "parametro" ("clave", "valor", "descripcion") VALUES
  ('aviso_max_activos', '3', 'Avisos activos por negocio'),
  ('aviso_vigencia_max_dias', '14', 'Días máximos de vigencia de un aviso'),
  ('reportes_max_abiertos_reciclador', '5', 'Reportes de negocios abiertos por reciclador'),
  ('reportes_max_por_negocio_24h', '2', 'Reportes de un reciclador sobre un mismo negocio en 24 horas')
ON CONFLICT ("clave") DO NOTHING;
