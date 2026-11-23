import type { Prisma, PrismaClient } from '../../generado/prisma/client.js';

// Cliente o transacción: permite escribir dentro de la misma transacción que el cambio principal
export type ClienteBd = PrismaClient | Prisma.TransactionClient;
