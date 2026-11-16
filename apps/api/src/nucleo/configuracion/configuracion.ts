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
  MENSAJERIA_PROVEEDOR: z.enum(['simulado', 'memoria']).default('simulado'),
  MENSAJERIA_EXPONER_CODIGO: booleano,
  CORREO_HOST: z.string().default('localhost'),
  CORREO_PUERTO_SMTP: z.coerce.number().int().default(1025),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_MAPS_CLAVE_NAVEGADOR: z.string().optional(),
  GOOGLE_MAPS_ID_MAPA: z.string().optional(),
  GOOGLE_MAPS_CLAVE_SERVIDOR: z.string().optional(),
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

export function limiteRefrescoPorMinuto(variables: NodeJS.ProcessEnv = process.env): number {
  return esquemaLimiteRefresco.parse(variables.API_LIMITE_REFRESCO_POR_MINUTO || undefined);
}

export class Configuracion {
  readonly entorno: 'development' | 'test' | 'production';
  readonly puerto: number;
  readonly limitePorMinuto: number;
  readonly origenesWeb: string[];
  readonly nivelLog: string;
  readonly jwtSecreto: Uint8Array;
  readonly accesoMinutos: number;
  readonly refrescoDias: number;
  readonly proveedorMensajes: 'simulado' | 'memoria';
  readonly exponerCodigo: boolean;
  readonly correo: { host: string; puerto: number };
  readonly googleClientId: string | undefined;
  readonly almacen: ConfiguracionAlmacen;
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

    if (valores.NODE_ENV === 'production') {
      if (!valores.JWT_SECRETO) throw new Error('Configuración no válida: falta JWT_SECRETO.');
      if (valores.ALMACEN_PROVEEDOR === 'memoria') {
        throw new Error('Configuración no válida: ALMACEN_PROVEEDOR=memoria no se permite en producción.');
      }
      // En producción el mapa es parte del servicio: sin clave el centro no podría colocar su pin
      if (!valores.GOOGLE_MAPS_CLAVE_NAVEGADOR) {
        throw new Error('Configuración no válida: falta GOOGLE_MAPS_CLAVE_NAVEGADOR.');
      }
      if (valores.MENSAJERIA_EXPONER_CODIGO) {
        throw new Error('Configuración no válida: MENSAJERIA_EXPONER_CODIGO no se permite en producción.');
      }
    }
    // Sin secreto en desarrollo se genera uno temporal: las sesiones se pierden al reiniciar
    this.jwtSecreto = new TextEncoder().encode(valores.JWT_SECRETO ?? randomBytes(32).toString('hex'));
    this.exponerCodigo = valores.MENSAJERIA_EXPONER_CODIGO && valores.NODE_ENV !== 'production';
  }

  get esProduccion(): boolean {
    return this.entorno === 'production';
  }
}
