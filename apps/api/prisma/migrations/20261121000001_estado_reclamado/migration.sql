-- Un premio ganado se reclama antes de entregarse; el valor nuevo se usa recién en la migración siguiente
ALTER TYPE "premio_ganado_estado" ADD VALUE IF NOT EXISTS 'RECLAMADO' BEFORE 'ENTREGADO';
