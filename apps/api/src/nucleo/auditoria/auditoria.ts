import type { Prisma } from '../../generado/prisma/client.js';
import type { AuditoriaTipo } from '../../generado/prisma/enums.js';
import type { ClienteBd } from '../base-datos/tipos.js';

export type EntradaAuditoria = {
  adminId: string;
  tipo: AuditoriaTipo;
  accion: string;
  entidad: string;
  entidadId: string;
  motivo?: string;
  antes?: Prisma.InputJsonValue;
  despues?: Prisma.InputJsonValue;
};

// Se escribe en la misma transacción que el cambio: si no se puede auditar, el cambio no ocurre
export async function auditar(cliente: ClienteBd, entrada: EntradaAuditoria): Promise<void> {
  await cliente.auditoria.create({ data: entrada });
}
