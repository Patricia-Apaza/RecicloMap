import { limpiarDatosGuardados, marcarDatosDeCopia } from '@/pwa/datos-guardados';
import type { SiguientePaso } from '@reciclomap/shared';

export const BASE_API = '/api/v1';

export type RolCuenta = 'RECICLADOR' | 'CENTRO' | 'COMPRADOR_MOVIL' | 'ADMIN';
export type EstadoCuenta = 'PENDIENTE_TELEFONO' | 'REGISTRO_INCOMPLETO' | 'ACTIVO' | 'SUSPENDIDO' | 'ELIMINADO';

export type ResumenUsuario = {
  id: string;
  nombre: string;
  rol: RolCuenta;
  estado: EstadoCuenta;
  siguientePaso: SiguientePaso;
};

export type Sesion = { tokenAcceso: string; expiraEn: string; usuario: ResumenUsuario };

export type PasoPendiente = {
  siguientePaso: SiguientePaso;
  telefono?: string;
  tokenTemporal?: string;
  nombre?: string;
  correo?: string;
  reenviarEn?: number;
  codigoDePrueba?: string;
};

export type CampoConError = { campo: string; mensaje: string };

export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number,
    readonly campos: CampoConError[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }

  // Mensaje del primer campo con ese nombre, para mostrarlo bajo el campo
  campo(nombre: string): string | undefined {
    return this.campos.find((campo) => campo.campo === nombre || campo.campo.startsWith(`${nombre}.`))?.mensaje;
  }
}

export const esSesion = (respuesta: Sesion | PasoPendiente): respuesta is Sesion => 'tokenAcceso' in respuesta;

// El token de acceso vive solo en memoria; el de refresco, en una cookie que el navegador no deja leer
let tokenAcceso: string | null = null;
let renovacion: Promise<Sesion | null> | null = null;
const oyentes = new Set<(sesion: Sesion | null) => void>();

export function escucharSesion(oyente: (sesion: Sesion | null) => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

// Para poder leer lo ya visto sin señal tras recargar, se recuerda solo quién era (nombre, rol y estado), nunca un token
const CLAVE_ULTIMO_USUARIO = 'rm_ultimo_usuario';
const usuarioRecordado = (): ResumenUsuario | null => {
  try {
    const texto = localStorage.getItem(CLAVE_ULTIMO_USUARIO);
    return texto ? (JSON.parse(texto) as ResumenUsuario) : null;
  } catch {
    return null;
  }
};
const recordarUsuario = (usuario: ResumenUsuario | null) => {
  try {
    if (usuario) localStorage.setItem(CLAVE_ULTIMO_USUARIO, JSON.stringify(usuario));
    else localStorage.removeItem(CLAVE_ULTIMO_USUARIO);
  } catch {
    // Sin espacio: solo se pierde la lectura sin señal tras recargar
  }
};

export function fijarSesion(sesion: Sesion | null): void {
  tokenAcceso = sesion?.tokenAcceso ? sesion.tokenAcceso : null;
  if (!sesion) {
    recordarUsuario(null);
    limpiarDatosGuardados();
  } else if (sesion.tokenAcceso) recordarUsuario(sesion.usuario);
  for (const oyente of oyentes) oyente(sesion);
}

// Para la conexión en vivo, que no pasa por pedir()
export function tokenActual(): string | null {
  return tokenAcceso;
}

export function hayToken(): boolean {
  return tokenAcceso !== null;
}

export function renovarSesion(): Promise<Sesion | null> {
  renovacion ??= (async () => {
    try {
      const respuesta = await fetch(`${BASE_API}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!respuesta.ok) return null;
      return (await respuesta.json()) as Sesion;
    } catch {
      // Sin señal no se pierde la sesión: se muestra lo ya guardado, solo para leer, hasta que vuelva la conexión
      const recordado = typeof navigator !== 'undefined' && navigator.onLine === false ? usuarioRecordado() : null;
      return recordado ? { tokenAcceso: '', expiraEn: '', usuario: recordado } : null;
    } finally {
      renovacion = null;
    }
  })().then((sesion) => {
    fijarSesion(sesion);
    return sesion;
  });
  return renovacion;
}

type Opciones = {
  cabeceras?: Record<string, string>;
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  formulario?: FormData;
  senal?: AbortSignal;
};

async function enviar(ruta: string, opciones: Opciones): Promise<Response> {
  const cabeceras: Record<string, string> = { ...opciones.cabeceras };
  if (tokenAcceso) cabeceras.Authorization = `Bearer ${tokenAcceso}`;
  let cuerpo: BodyInit | undefined;
  if (opciones.formulario) cuerpo = opciones.formulario;
  else if (opciones.cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(opciones.cuerpo);
  }
  return fetch(`${BASE_API}${ruta}`, {
    method: opciones.metodo ?? (cuerpo ? 'POST' : 'GET'),
    headers: cabeceras,
    body: cuerpo,
    credentials: 'same-origin',
    signal: opciones.senal,
  });
}

async function leerError(respuesta: Response): Promise<ErrorApi> {
  try {
    const { error } = (await respuesta.json()) as {
      error: { codigo: string; mensaje: string; campos?: CampoConError[] };
    };
    return new ErrorApi(error.codigo, error.mensaje, respuesta.status, error.campos);
  } catch {
    return new ErrorApi(
      'SIN_CONEXION',
      'No pudimos conectarnos. Revisa tu internet e intenta de nuevo.',
      respuesta.status,
    );
  }
}

export const MENSAJE_SIN_CONEXION_ESCRITURA =
  'Sin conexión: esta acción necesita internet y no se guarda para después. Inténtalo cuando vuelva la señal.';

async function solicitar(ruta: string, opciones: Opciones): Promise<Response> {
  // Nada que cambie datos se deja en cola: sin internet se avisa y listo
  const escribe =
    (opciones.metodo ?? (opciones.cuerpo !== undefined || opciones.formulario ? 'POST' : 'GET')) !== 'GET';
  if (escribe && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorApi('SIN_CONEXION', MENSAJE_SIN_CONEXION_ESCRITURA, 0);
  }
  let respuesta: Response;
  try {
    respuesta = await enviar(ruta, opciones);
  } catch {
    throw new ErrorApi('SIN_CONEXION', 'No pudimos conectarnos. Revisa tu internet e intenta de nuevo.', 0);
  }
  // Un acceso vencido se renueva una vez, sin que la persona lo note
  if (respuesta.status === 401 && tokenAcceso && !ruta.startsWith('/auth/')) {
    if (await renovarSesion()) respuesta = await enviar(ruta, opciones);
  }
  if (!respuesta.ok) throw await leerError(respuesta);
  // Si la respuesta vino de la copia guardada (sin conexión), se avisa de qué fecha son los datos
  if (respuesta.headers.get('X-RM-Desde-Cache')) marcarDatosDeCopia(respuesta.headers.get('X-RM-Guardado'));
  else if (opciones.metodo === undefined || opciones.metodo === 'GET') marcarDatosDeCopia(null);
  return respuesta;
}

export async function pedir<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const respuesta = await solicitar(ruta, opciones);
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

export async function pedirArchivo(ruta: string): Promise<Blob> {
  return (await solicitar(ruta, {})).blob();
}
