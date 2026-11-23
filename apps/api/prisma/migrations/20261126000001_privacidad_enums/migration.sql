-- Fase 13A: valores nuevos de enumerados (se usan en la migración siguiente)
ALTER TYPE "usuario_estado" ADD VALUE IF NOT EXISTS 'EN_ELIMINACION';
ALTER TYPE "tipo_consentimiento" ADD VALUE IF NOT EXISTS 'MAYOR_EDAD';
ALTER TYPE "proposito_codigo" ADD VALUE IF NOT EXISTS 'ELIMINAR_CUENTA';
