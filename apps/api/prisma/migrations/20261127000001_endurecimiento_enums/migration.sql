-- Fase 13B: valores nuevos de enumerados (se usan en la migración siguiente)
ALTER TYPE "premio_ganado_estado" ADD VALUE IF NOT EXISTS 'RENUNCIADO';
ALTER TYPE "proposito_codigo" ADD VALUE IF NOT EXISTS 'CONFIRMAR_ACCION';
