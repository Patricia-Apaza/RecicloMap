import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { esquemaContrasena, esquemaCorreo, esquemaTelefono } from '@reciclomap/shared';
import { z } from 'zod';
import { PrismaClient } from '../src/generado/prisma/client.js';
import { urlPropietarioActual } from '../src/nucleo/base-datos/conexiones.js';
import '../src/nucleo/configuracion/entorno.js';
import { ciudadActiva } from '../src/modulos/auth/cuentas.js';
import { hashearContrasena } from '../src/nucleo/seguridad/contrasenas.js';

const esquemaAdmin = z.object({
  nombre: z.string().trim().min(3, 'El nombre debe tener al menos 3 letras.').max(120),
  telefono: esquemaTelefono,
  correo: esquemaCorreo,
  contrasena: esquemaContrasena,
});

// Pide la contraseña sin mostrarla en pantalla
function pedirContrasena(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const lector = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const escribir = (lector as unknown as { _writeToOutput: (texto: string) => void })._writeToOutput;
    (lector as unknown as { _writeToOutput: (texto: string) => void })._writeToOutput = (texto: string) => {
      escribir.call(lector, texto.startsWith(pregunta) ? texto : '');
    };
    lector.question(pregunta, (respuesta) => {
      lector.close();
      process.stdout.write('\n');
      resolver(respuesta);
    });
  });
}

async function crearAdmin(): Promise<void> {
  const { values } = parseArgs({
    options: { nombre: { type: 'string' }, telefono: { type: 'string' }, correo: { type: 'string' } },
  });
  const contrasena =
    process.env.ADMIN_CONTRASENA ??
    (process.stdin.isTTY ? await pedirContrasena('Contraseña (mínimo 8 caracteres): ') : '');
  const datos = esquemaAdmin.safeParse({ ...values, contrasena });
  if (!datos.success) {
    const detalle = datos.error.issues
      .map((problema) => `- ${problema.path.join('.')}: ${problema.message}`)
      .join('\n');
    throw new Error(
      `Datos no válidos:\n${detalle}\n\nUso: pnpm admin:crear --nombre "Nombre Apellido" --telefono 9XXXXXXXX --correo correo@dominio.pe`,
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlPropietarioActual() }) });
  try {
    const { nombre, telefono, correo } = datos.data;
    const ocupado = await prisma.usuario.findFirst({
      where: { OR: [{ telefono }, { correo }] },
      select: { id: true },
    });
    if (ocupado) throw new Error('Ya existe una cuenta con ese teléfono o correo.');

    await prisma.usuario.create({
      data: {
        rol: 'ADMIN',
        nombre,
        telefono,
        telefonoVerificadoEn: new Date(),
        correo,
        ciudadId: await ciudadActiva(prisma),
        estado: 'ACTIVO',
        hashContrasena: await hashearContrasena(datos.data.contrasena),
        preferencia: { create: {} },
      },
    });
    console.log(
      `Cuenta de administración creada para ${nombre}. Al entrar se le pedirá un código enviado a su teléfono.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

crearAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
