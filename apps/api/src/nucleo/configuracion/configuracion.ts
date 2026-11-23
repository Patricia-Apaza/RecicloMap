import './entorno.js';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const booleano = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((valor) => valor === 'true' || valor === '1');

const esquemaLimiteAcceso = z.coerce.number().int().min(1).default(10);
const esquemaLimiteRefresco = z.coerce.number().int().min(1).default(60);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PUERTO: z.coerce.number().int().min(1).max(65535).default(3001),
  API_LIMITE_POR_MINUTO: z.coerce.number().int().min(1).default(120),
  API_LIMITE_ACCESO_POR_MINUTO: esquemaLimiteAcceso,
  API_LIMITE_REFRESCO_POR_MINUTO: esquemaLimiteRefresco,
  WEB_ORIGEN: z.string().default('http://localhost:3000'),
  LOG_NIVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_SECRETO: z.string().min(32, 'JWT_SECRETO debe tener al menos 32 caracteres.').optional(),
  SESION_ACCESO_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),
  SESION_REFRESCO_DIAS: z.coerce.number().int().min(1).max(90).default(30),
  // La documentación de la API solo existe en desarrollo; en pruebas se enciende a propósito y en producción nunca
  API_DOCUMENTACION: booleano,
  SESION_ADMIN_HORAS: z.coerce.number().int().min(1).max(24).default(8),
  SESION_GRACIA_SEGUNDOS: z.coerce.number().int().min(0).max(60).default(10),
  MENSAJERIA_PROVEEDOR: z.enum(['simulado', 'memoria']).default('simulado'),
  MENSAJERIA_EXPONER_CODIGO: booleano,
  CORREO_HOST: z.string().default('localhost'),
  CORREO_PUERTO_SMTP: z.coerce.number().int().default(1025),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_MAPS_CLAVE_NAVEGADOR: z.string().optional(),
  GOOGLE_MAPS_ID_MAPA: z.string().optional(),
  GOOGLE_MAPS_CLAVE_SERVIDOR: z.string().optional(),
  // Modo demostración: solo a propósito. Producción endurecida, con cuentas de la semilla, código de prueba visible y mapa de OSM
  MODO_DEMOSTRACION: booleano,
  // Cuántos servidores intermedios (la web, el túnel) están delante de la API; 0 = ninguno
  CONFIAR_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  MAPA_PROVEEDOR: z.enum(['osm', 'maptiler', 'google']).default('osm'),
  MAPTILER_CLAVE: z.string().optional(),
  MAPA_TESELAS_URL: z.string().optional(),
  MAPA_ATRIBUCION: z.string().optional(),
  MAPA_PIN_OBLIGATORIO: z.enum(['true', 'false']).default('true'),
  GEOCODIFICADOR_URL: z.string().default('https://nominatim.openstreetmap.org'),
  GEOCODIFICADOR_IDENTIDAD: z.string().optional(),
  SOPORTE_CORREO: z.string().default('soporte@reciclomap.pe'),
  PUSH_CLAVE_PUBLICA: z.string().optional(),
  PUSH_CLAVE_PRIVADA: z.string().optional(),
  PUSH_CONTACTO: z.string().default('mailto:soporte@reciclomap.pe'),
  ALMACEN_PROVEEDOR: z.enum(['s3', 'memoria']).default('s3'),
  ALMACEN_URL: z.string().default('http://localhost:8333'),
  ALMACEN_REGION: z.string().default('us-east-1'),
  ALMACEN_BUCKET: z.string().default('reciclomap-fotos'),
  ALMACEN_CLAVE_ACCESO: z.string().optional(),
  ALMACEN_CLAVE_SECRETA: z.string().optional(),
});

export type ConfiguracionAlmacen = {
  proveedor: 's3' | 'memoria';
  url: string;
  region: string;
  bucket: string;
  claveAcceso: string | undefined;
  claveSecreta: string | undefined;
};

// El decorador de límite no tiene acceso a la inyección de dependencias: lee la variable directamente
export function limiteAccesoPorMinuto(variables: NodeJS.ProcessEnv = process.env): number {
  return esquemaLimiteAcceso.parse(variables.API_LIMITE_ACCESO_POR_MINUTO || undefined);
}

// Confirmar con contraseña o código: pocos intentos por minuto
export function limiteConfirmacionPorMinuto(variables: NodeJS.ProcessEnv = process.env): number {
  return z.coerce
    .number()
    .int()
    .min(1)
    .default(5)
    .parse(variables.API_LIMITE_CONFIRMACION_POR_MINUTO || undefined);
}

export function limiteRefrescoPorMinuto(variables: NodeJS.ProcessEnv = process.env): number {
  return esquemaLimiteRefresco.parse(variables.API_LIMITE_REFRESCO_POR_MINUTO || undefined);
}

export type ConfiguracionMapa = {
  proveedor: 'osm' | 'maptiler' | 'google';
  // Teselas rasterizadas para Leaflet; null cuando el proveedor es Google
  teselas: { url: string; atribucion: string; maxZoom: number } | null;
  pinObligatorio: boolean;
};

const ATRIBUCION_OSM =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export class Configuracion {
  readonly entorno: 'development' | 'test' | 'production';
  readonly puerto: number;
  readonly limitePorMinuto: number;
  readonly origenesWeb: string[];
  readonly nivelLog: string;
  readonly jwtSecreto: Uint8Array;
  readonly accesoMinutos: number;
  readonly refrescoDias: number;
  readonly sesionAdminHoras: number;
  readonly sesionGraciaSegundos: number;
  readonly exponeDocumentacion: boolean;
  readonly proveedorMensajes: 'simulado' | 'memoria';
  readonly exponerCodigo: boolean;
  readonly correo: { host: string; puerto: number };
  readonly googleClientId: string | undefined;
  readonly almacen: ConfiguracionAlmacen;
  readonly mapa: ConfiguracionMapa;
  readonly demostracion: boolean;
  readonly confiarProxy: number;
  readonly geocodificador: { url: string; identidad: string };
  readonly googleMaps: { claveNavegador: string | undefined; idMapa: string; claveServidor: string | undefined };
  readonly soporteCorreo: string;
  // Web Push: sin las dos claves solo hay avisos en la app y en vivo
  readonly push: { clavePublica: string; clavePrivada: string; contacto: string } | null;

  constructor(variables: NodeJS.ProcessEnv = process.env) {
    const resultado = esquema.safeParse(variables);
    if (!resultado.success) {
      const detalle = resultado.error.issues
        .map((problema) => `${problema.path.join('.')}: ${problema.message}`)
        .join('; ');
      throw new Error(`Configuración no válida. Revisa el archivo .env. ${detalle}`);
    }
    const valores = resultado.data;
    this.entorno = valores.NODE_ENV;
    this.puerto = valores.API_PUERTO;
    this.limitePorMinuto = valores.API_LIMITE_POR_MINUTO;
    this.origenesWeb = valores.WEB_ORIGEN.split(',')
      .map((origen) => origen.trim())
      .filter(Boolean);
    this.nivelLog = valores.NODE_ENV === 'test' ? 'silent' : valores.LOG_NIVEL;
    this.accesoMinutos = valores.SESION_ACCESO_MINUTOS;
    this.refrescoDias = valores.SESION_REFRESCO_DIAS;
    this.sesionAdminHoras = valores.SESION_ADMIN_HORAS;
    this.sesionGraciaSegundos = valores.SESION_GRACIA_SEGUNDOS;
    this.exponeDocumentacion =
      valores.NODE_ENV !== 'production' && (valores.NODE_ENV === 'development' || valores.API_DOCUMENTACION);
    this.proveedorMensajes = valores.MENSAJERIA_PROVEEDOR;
    this.correo = { host: valores.CORREO_HOST, puerto: valores.CORREO_PUERTO_SMTP };
    this.googleClientId = valores.GOOGLE_CLIENT_ID || undefined;
    this.googleMaps = {
      claveNavegador: valores.GOOGLE_MAPS_CLAVE_NAVEGADOR || undefined,
      idMapa: valores.GOOGLE_MAPS_ID_MAPA || 'DEMO_MAP_ID',
      // Solo para Routes API desde el servidor: la web nunca la recibe
      claveServidor: valores.GOOGLE_MAPS_CLAVE_SERVIDOR || undefined,
    };
    this.soporteCorreo = valores.SOPORTE_CORREO;
    this.demostracion = valores.MODO_DEMOSTRACION;
    this.confiarProxy = valores.CONFIAR_PROXY;
    this.mapa = resolverMapa(valores, this.googleMaps.claveNavegador);
    this.geocodificador = {
      url: valores.GEOCODIFICADOR_URL.replace(/\/$/, ''),
      identidad: valores.GEOCODIFICADOR_IDENTIDAD || `RecicloMap/1.0 (${valores.SOPORTE_CORREO})`,
    };
    this.push =
      valores.PUSH_CLAVE_PUBLICA && valores.PUSH_CLAVE_PRIVADA
        ? {
            clavePublica: valores.PUSH_CLAVE_PUBLICA,
            clavePrivada: valores.PUSH_CLAVE_PRIVADA,
            contacto: valores.PUSH_CONTACTO,
          }
        : null;
    this.almacen = {
      proveedor: valores.ALMACEN_PROVEEDOR,
      url: valores.ALMACEN_URL,
      region: valores.ALMACEN_REGION,
      bucket: valores.ALMACEN_BUCKET,
      claveAcceso: valores.ALMACEN_CLAVE_ACCESO || undefined,
      claveSecreta: valores.ALMACEN_CLAVE_SECRETA || undefined,
    };

    if (valores.MODO_DEMOSTRACION) comprobarDemostracion(valores.NODE_ENV, variables);
    if (valores.NODE_ENV === 'production') {
      if (!valores.JWT_SECRETO) throw new Error('Configuración no válida: falta JWT_SECRETO.');
      if (valores.ALMACEN_PROVEEDOR === 'memoria') {
        throw new Error('Configuración no válida: ALMACEN_PROVEEDOR=memoria no se permite en producción.');
      }
      // El servidor público de OpenStreetMap no admite el tráfico de un servicio en producción
      if (!valores.MODO_DEMOSTRACION && this.mapa.proveedor === 'osm' && !valores.MAPA_TESELAS_URL) {
        throw new Error(
          'Configuración no válida: el servidor público de OpenStreetMap no se permite en producción. Usa MAPA_PROVEEDOR=maptiler o google, o MAPA_TESELAS_URL propio.',
        );
      }
      if (valores.MENSAJERIA_EXPONER_CODIGO && !valores.MODO_DEMOSTRACION) {
        throw new Error('Configuración no válida: MENSAJERIA_EXPONER_CODIGO no se permite en producción.');
      }
      comprobarProduccion(variables, { demostracion: valores.MODO_DEMOSTRACION });
    }
    // Sin secreto en desarrollo se genera uno temporal: las sesiones se pierden al reiniciar
    this.jwtSecreto = new TextEncoder().encode(valores.JWT_SECRETO ?? randomBytes(32).toString('hex'));
    this.exponerCodigo =
      valores.MENSAJERIA_EXPONER_CODIGO && (valores.NODE_ENV !== 'production' || valores.MODO_DEMOSTRACION);
  }

  get esProduccion(): boolean {
    return this.entorno === 'production';
  }
}

// Valores de ejemplo y de desarrollo que nunca deben llegar a producción: la API se niega a arrancar con ellos
const CLAVES_DE_DESARROLLO = [
  /^cambia_/i,
  /clave_admin_solo_para_ci/i,
  /clave-de-pruebas/i,
  /^prueba2026!?$/i,
  /^changeme$/i,
];

export function comprobarProduccion(variables: NodeJS.ProcessEnv, opciones: { demostracion?: boolean } = {}): void {
  const problemas: string[] = [];
  const dev = (valor: string | undefined) =>
    valor ? CLAVES_DE_DESARROLLO.some((patron) => patron.test(valor)) : false;
  if (dev(variables.JWT_SECRETO)) problemas.push('JWT_SECRETO es el valor de ejemplo');
  for (const nombre of [
    'DB_PROPIETARIO_CLAVE',
    'DB_API_CLAVE',
    'DB_ADMIN_CLAVE',
    'ALMACEN_CLAVE_ACCESO',
    'ALMACEN_CLAVE_SECRETA',
  ]) {
    if (dev(variables[nombre])) problemas.push(`${nombre} es una clave de desarrollo`);
  }
  if (dev(variables.GOOGLE_MAPS_CLAVE_NAVEGADOR)) problemas.push('GOOGLE_MAPS_CLAVE_NAVEGADOR es una clave de pruebas');
  if (variables.SEMILLA_CLAVE && !opciones.demostracion)
    problemas.push('SEMILLA_CLAVE (la contraseña de los datos semilla) no debe existir en producción');
  if (variables.MENSAJERIA_PROVEEDOR === 'memoria') problemas.push('MENSAJERIA_PROVEEDOR=memoria es solo para pruebas');
  const origenes = (variables.WEB_ORIGEN ?? 'http://localhost:3000').split(',').map((o) => o.trim());
  if (origenes.some((o) => /localhost|127\.0\.0\.1/i.test(o))) problemas.push('WEB_ORIGEN apunta a localhost');
  if (problemas.length > 0) {
    throw new Error(`Configuración no válida para producción: ${problemas.join('; ')}. Corrígelo antes de arrancar.`);
  }
}

// Sin clave el mapa funciona con OpenStreetMap; Google y MapTiler solo si el equipo los configura
function resolverMapa(valores: z.infer<typeof esquema>, claveGoogle: string | undefined): ConfiguracionMapa {
  const pinObligatorio = valores.MAPA_PIN_OBLIGATORIO === 'true';
  if (valores.MAPA_TESELAS_URL) {
    return {
      proveedor: valores.MAPA_PROVEEDOR,
      teselas: { url: valores.MAPA_TESELAS_URL, atribucion: valores.MAPA_ATRIBUCION || ATRIBUCION_OSM, maxZoom: 19 },
      pinObligatorio,
    };
  }
  if (valores.MAPA_PROVEEDOR === 'google') {
    if (!claveGoogle)
      throw new Error('Configuración no válida: MAPA_PROVEEDOR=google requiere GOOGLE_MAPS_CLAVE_NAVEGADOR.');
    return { proveedor: 'google', teselas: null, pinObligatorio };
  }
  if (valores.MAPA_PROVEEDOR === 'maptiler') {
    if (!valores.MAPTILER_CLAVE)
      throw new Error('Configuración no válida: MAPA_PROVEEDOR=maptiler requiere MAPTILER_CLAVE.');
    return {
      proveedor: 'maptiler',
      teselas: {
        url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${valores.MAPTILER_CLAVE}`,
        atribucion: `© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> ${ATRIBUCION_OSM}`,
        maxZoom: 21,
      },
      pinObligatorio,
    };
  }
  return {
    proveedor: 'osm',
    teselas: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', atribucion: ATRIBUCION_OSM, maxZoom: 19 },
    pinObligatorio,
  };
}

// La demostración es producción endurecida con tres excepciones (cuentas de la semilla, código de prueba y mapa público de OSM).
// Por eso se pide a propósito, con una contraseña propia de la semilla y una dirección pública con https
export function comprobarDemostracion(entorno: string, variables: NodeJS.ProcessEnv): void {
  const problemas: string[] = [];
  if (entorno !== 'production') problemas.push('solo se usa con NODE_ENV=production');
  const clave = variables.SEMILLA_CLAVE ?? '';
  if (clave.length < 10) problemas.push('SEMILLA_CLAVE debe tener al menos 10 caracteres');
  if (CLAVES_DE_DESARROLLO.some((patron) => patron.test(clave))) {
    problemas.push('SEMILLA_CLAVE no puede ser la contraseña de ejemplo');
  }
  const origenes = (variables.WEB_ORIGEN ?? '').split(',').map((o) => o.trim());
  if (!origenes[0] || origenes.some((o) => !o.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(o))) {
    problemas.push('WEB_ORIGEN debe ser la dirección pública con https');
  }
  if (problemas.length > 0) {
    throw new Error(`Configuración no válida para la demostración: ${problemas.join('; ')}.`);
  }
}
