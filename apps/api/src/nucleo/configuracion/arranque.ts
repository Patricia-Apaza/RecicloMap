import { PrismaApi } from '../base-datos/prisma.js';
import { verificarContrasena } from '../seguridad/contrasenas.js';

// La contraseña de los datos semilla es pública: ninguna cuenta real puede usarla
const CLAVE_SEMILLA = 'Prueba2026!';

// En producción la API no arranca si la base tiene datos semilla o una cuenta con la contraseña de semilla
export async function verificarArranqueSeguro(
  prisma: PrismaApi,
  claveSemilla: string = CLAVE_SEMILLA,
  opciones: { demostracion?: boolean } = {},
): Promise<void> {
  const [semilla, administradores] = await Promise.all([
    prisma.usuario.count({
      where: { OR: [{ telefono: { startsWith: '9000000' } }, { correo: { endsWith: '@reciclomap.test' } }] },
    }),
    prisma.usuario.findMany({
      where: { rol: 'ADMIN', hashContrasena: { not: null } },
      select: { hashContrasena: true },
    }),
  ]);
  const problemas: string[] = [];
  // En la demostración las cuentas de la semilla existen a propósito, pero con una contraseña propia, nunca la de ejemplo
  if (semilla > 0 && !opciones.demostracion) problemas.push(`la base tiene ${semilla} cuentas de los datos semilla`);
  for (const { hashContrasena } of administradores) {
    if (hashContrasena && (await verificarContrasena(hashContrasena, claveSemilla))) {
      problemas.push('una cuenta de administración usa la contraseña de los datos semilla');
      break;
    }
  }
  if (problemas.length > 0) {
    throw new Error(
      `No se puede arrancar en producción: ${problemas.join('; ')}. Carga una base limpia y crea tu administrador con «pnpm admin:crear».`,
    );
  }
}
