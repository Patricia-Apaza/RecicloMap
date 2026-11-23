import { z } from 'zod';
import { normalizarTelefono, PATRON_TELEFONO } from '../formatos/telefono.js';

export const LONGITUD_MINIMA_CONTRASENA = 8;

export const esquemaTelefono = z
  .string({ error: 'Escribe tu teléfono.' })
  .transform(normalizarTelefono)
  .refine((valor) => PATRON_TELEFONO.test(valor), 'Ingresa 9 dígitos, por ejemplo 951 234 567.');

export const esquemaCorreo = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Revisa el formato, por ejemplo nombre@correo.com.').max(120, 'El correo es demasiado largo.'));

export const esquemaContrasena = z
  .string({ error: 'Escribe tu contraseña.' })
  .min(LONGITUD_MINIMA_CONTRASENA, `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`)
  .max(128, 'La contraseña es demasiado larga.');

export const esquemaCodigo = z.string({ error: 'Escribe el código.' }).regex(/^\d{6}$/, 'El código tiene 6 dígitos.');

const aceptaTerminos = z.literal(true, { error: 'Debes aceptar los términos y la política de privacidad.' });

const mayorDeEdad = z.literal(true, { error: 'Debes declarar que eres mayor de 18 años.' });

const correoOpcional = z.union([esquemaCorreo, z.literal('').transform(() => undefined)]).optional();

export const esquemaRegistroReciclador = z.object({
  nombre: z
    .string({ error: 'Escribe tu nombre y apellido.' })
    .trim()
    .min(3, 'Escribe tu nombre y apellido.')
    .max(120, 'El nombre es demasiado largo.')
    .refine((valor) => valor.split(/\s+/).length >= 2, 'Escribe tu nombre y apellido.'),
  telefono: esquemaTelefono,
  correo: correoOpcional,
  contrasena: esquemaContrasena,
  aceptaTerminos,
  mayorDeEdad,
  codigoInvitacion: z.string().trim().max(20).optional(),
});
export type RegistroReciclador = z.infer<typeof esquemaRegistroReciclador>;

export const TIPOS_NEGOCIO = ['CENTRO', 'MOVIL'] as const;

export const esquemaRegistroNegocio = z.object({
  tipo: z.enum(TIPOS_NEGOCIO, { error: 'Elige si eres centro de acopio o comprador móvil.' }),
  telefono: esquemaTelefono,
  correo: correoOpcional,
  contrasena: esquemaContrasena,
  aceptaTerminos,
  mayorDeEdad,
});
export type RegistroNegocio = z.infer<typeof esquemaRegistroNegocio>;

export const esquemaEnviarCodigo = z.object({ telefono: esquemaTelefono });

export const esquemaVerificarTelefono = z.object({ telefono: esquemaTelefono, codigo: esquemaCodigo });

export const esquemaIdentificador = z
  .string({ error: 'Escribe tu teléfono o correo.' })
  .trim()
  .min(1, 'Escribe tu teléfono o correo.')
  .max(120);

export const esquemaInicioSesion = z.object({
  identificador: esquemaIdentificador,
  contrasena: z.string({ error: 'Escribe tu contraseña.' }).min(1, 'Escribe tu contraseña.').max(128),
});

export const esquemaCodigoAdmin = z.object({ tokenTemporal: z.string().min(1), codigo: esquemaCodigo });

export const esquemaGoogle = z.object({ credencial: z.string().min(1, 'Falta la credencial de Google.') });

export const ROLES_REGISTRABLES = ['RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL'] as const;

export const esquemaCompletarGoogle = z.object({
  tokenTemporal: z.string().min(1),
  rol: z.enum(ROLES_REGISTRABLES, { error: 'Elige cómo vas a usar RecicloMap.' }),
  telefono: esquemaTelefono,
  aceptaTerminos,
  mayorDeEdad,
});

export const esquemaRecuperar = z.object({ identificador: esquemaIdentificador });

export const esquemaVerificarRecuperacion = z.object({ identificador: esquemaIdentificador, codigo: esquemaCodigo });

export const esquemaRestablecer = z.object({ tokenRestablecer: z.string().min(1), contrasena: esquemaContrasena });

export const esquemaCambiarContrasena = z.object({
  actual: z.string().min(1, 'Escribe tu contraseña actual.').max(128),
  nueva: esquemaContrasena,
});

export const esquemaMateriales = z.object({
  materiales: z
    .array(z.enum(['pet', 'carton', 'papel', 'plastico', 'metal']), { error: 'Elige al menos un material.' })
    .min(1, 'Elige al menos un material.')
    .max(5),
});

export const SIGUIENTES_PASOS = [
  'VERIFICAR_TELEFONO',
  'CODIGO_ADMIN',
  'COMPLETAR_CUENTA_GOOGLE',
  'ACEPTAR_TEXTOS',
  'CANCELAR_ELIMINACION',
  'ELEGIR_MATERIALES',
  'COMPLETAR_NEGOCIO',
  'ESPERAR_VERIFICACION',
  'LISTO',
] as const;
export type SiguientePaso = (typeof SIGUIENTES_PASOS)[number];
