-- Operaciones y calificaciones (Fase 7)

-- Aviso de 72 h en ENTREGADA enviado una sola vez; la marca la escribe la tarea
ALTER TABLE "operacion" ADD COLUMN "aviso_entrega_en" TIMESTAMPTZ(3);
-- Se pidió al negocio corregir los kilos: puede volver a confirmarlos una vez
ALTER TABLE "operacion" ADD COLUMN "correccion_pedida_en" TIMESTAMPTZ(3);

-- Push enviado una sola vez aunque haya varias instancias de la API
ALTER TABLE "notificacion" ADD COLUMN "push_enviada_en" TIMESTAMPTZ(3);
CREATE INDEX "notificacion_creada_en_idx" ON "notificacion" ("creada_en");

ALTER TABLE "respuesta_calificacion"
  ADD CONSTRAINT "respuesta_calificacion_texto" CHECK (char_length(btrim("texto")) >= 3);

-- La etiqueta debe ser de la dirección de la calificación (al negocio o al reciclador)
CREATE FUNCTION "calificacion_etiqueta_validar"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_destino_es_negocio boolean;
  v_etiqueta destino_calificacion;
BEGIN
  SELECT EXISTS (SELECT 1 FROM "comprador" c WHERE c."usuario_id" = cal."destino_id")
    INTO v_destino_es_negocio
    FROM "calificacion" cal WHERE cal."id" = NEW."calificacion_id";
  SELECT "destino" INTO v_etiqueta FROM "etiqueta_calificacion" WHERE "id" = NEW."etiqueta_id";
  IF (v_destino_es_negocio AND v_etiqueta <> 'NEGOCIO') OR (NOT v_destino_es_negocio AND v_etiqueta <> 'RECICLADOR') THEN
    RAISE EXCEPTION 'La etiqueta no corresponde a quien recibe la calificación' USING ERRCODE = 'RM022';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "calificacion_etiqueta_validar" BEFORE INSERT ON "calificacion_etiqueta"
  FOR EACH ROW EXECUTE FUNCTION "calificacion_etiqueta_validar"();

-- Las calificaciones y sus respuestas solo las escriben las partes: el administrador no
REVOKE INSERT, UPDATE, DELETE ON "calificacion", "calificacion_etiqueta", "respuesta_calificacion" FROM rm_admin;
-- Una calificación no se edita ni se borra; su respuesta tampoco
REVOKE UPDATE, DELETE ON "calificacion", "calificacion_etiqueta", "respuesta_calificacion" FROM rm_api;
-- Los movimientos de puntos solo se insertan
REVOKE UPDATE, DELETE ON "movimiento_puntos" FROM rm_api, rm_admin;

-- El administrador puede pedir al negocio que corrija los kilos, pero nunca escribirlos
GRANT UPDATE ("correccion_pedida_en") ON "operacion" TO rm_admin;
