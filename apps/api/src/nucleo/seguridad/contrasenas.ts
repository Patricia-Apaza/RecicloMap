import { hash, verify } from '@node-rs/argon2';

// Argon2id con los parámetros recomendados por OWASP
const OPCIONES = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashearContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, OPCIONES);
}

export async function verificarContrasena(hashGuardado: string, contrasena: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, contrasena);
  } catch {
    return false;
  }
}

let hashDeRelleno: Promise<string> | undefined;

// Se verifica contra un hash cualquiera cuando la cuenta no existe, para no revelar su existencia por el tiempo de respuesta
export async function compararSinCuenta(contrasena: string): Promise<false> {
  hashDeRelleno ??= hashearContrasena('relleno-sin-cuenta');
  await verificarContrasena(await hashDeRelleno, contrasena);
  return false;
}
