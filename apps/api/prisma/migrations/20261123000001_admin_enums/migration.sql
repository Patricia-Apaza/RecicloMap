-- Fase 12A: nuevos tipos para la auditoría de avisos y los avisos de cuenta; se usan en la migración siguiente
ALTER TYPE "auditoria_tipo" ADD VALUE IF NOT EXISTS 'AVISOS';
ALTER TYPE "notificacion_tipo" ADD VALUE IF NOT EXISTS 'CUENTA';
