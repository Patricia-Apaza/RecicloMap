-- Pin del centro confirmado en el mapa y horario habitual del comprador móvil (sin días)
ALTER TABLE "comprador" ADD COLUMN "ubicacion_confirmada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "comprador" ADD COLUMN "hora_inicio" TIME(0);
ALTER TABLE "comprador" ADD COLUMN "hora_fin" TIME(0);

ALTER TABLE "comprador"
  ADD CONSTRAINT "comprador_horario_movil" CHECK (
    ("hora_inicio" IS NULL AND "hora_fin" IS NULL) OR ("tipo" = 'MOVIL' AND "hora_fin" > "hora_inicio")
  );
