import '../configuracion/entorno.js';

export type RolBd = 'propietario' | 'api' | 'admin';

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable ${nombre}. Copia .env.example como .env en la raíz.`);
  }
  return valor;
}

function credenciales(rol: RolBd): { usuario: string; clave: string } {
  if (rol === 'api') {
    return { usuario: 'rm_api', clave: requerida('DB_API_CLAVE') };
  }
  if (rol === 'admin') {
    return { usuario: 'rm_admin', clave: requerida('DB_ADMIN_CLAVE') };
  }
  return { usuario: process.env.DB_PROPIETARIO ?? 'reciclomap', clave: requerida('DB_PROPIETARIO_CLAVE') };
}

// Las pruebas fijan RM_BD_OBJETIVO=pruebas para no tocar la base de desarrollo
export function usaBdDePruebas(): boolean {
  return process.env.RM_BD_OBJETIVO === 'pruebas';
}

export function nombreBd(pruebas: boolean = usaBdDePruebas()): string {
  return pruebas ? (process.env.DB_NOMBRE_PRUEBAS ?? 'reciclomap_pruebas') : (process.env.DB_NOMBRE ?? 'reciclomap');
}

export function urlBd(rol: RolBd, baseDatos: string = nombreBd()): string {
  const { usuario, clave } = credenciales(rol);
  const host = process.env.DB_HOST ?? 'localhost';
  const puerto = process.env.DB_PUERTO ?? '5433';
  // Sesión en UTC: el driver envía las fechas sin zona y el servidor puede estar en hora de Lima
  const opciones = encodeURIComponent('-c TimeZone=UTC');
  return `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}@${host}:${puerto}/${baseDatos}?options=${opciones}`;
}

export function urlPropietarioActual(): string {
  return urlBd('propietario');
}
