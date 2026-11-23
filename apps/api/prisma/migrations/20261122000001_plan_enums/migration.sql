-- Fase 11: la solicitud de plan se aprueba, se rechaza o se cancela; los valores nuevos se usan en la migración siguiente
ALTER TYPE "solicitud_plan_estado" RENAME VALUE 'ATENDIDA' TO 'APROBADA';
ALTER TYPE "solicitud_plan_estado" ADD VALUE IF NOT EXISTS 'RECHAZADA';
ALTER TYPE "solicitud_plan_estado" ADD VALUE IF NOT EXISTS 'CANCELADA';
ALTER TYPE "notificacion_tipo" ADD VALUE IF NOT EXISTS 'PLAN';
