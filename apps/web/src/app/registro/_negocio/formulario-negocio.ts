import {
  CODIGOS_MATERIAL,
  type CodigoMaterial,
  esquemaPrecios,
  esquemaRegistroCentro,
  esquemaRegistroMovil,
  METODOS_PAGO,
  type RegistroNegocioCompleto,
  VEHICULOS,
} from '@reciclomap/shared';

export type Demanda = 'ALTA' | 'MEDIA' | 'BAJA';
export type FilaPrecio = { activo: boolean; min: string; max: string; demanda: Demanda };
export type MetodoPago = (typeof METODOS_PAGO)[number];
export type Vehiculo = (typeof VEHICULOS)[number];

export type DatosNegocio = {
  nombreComercial: string;
  descripcion: string;
  direccion: string;
  telefonoNegocio: string;
  whatsapp: string;
  zonaId: number | null;
  dias: number[];
  abre: string;
  cierra: string;
  precios: Record<CodigoMaterial, FilaPrecio>;
  pagos: MetodoPago[];
  vehiculo: Vehiculo;
  fotos: string[];
  ubicacion: { lat: number; lng: number } | null;
};

const filaVacia = (): FilaPrecio => ({ activo: false, min: '', max: '', demanda: 'MEDIA' });

export function datosIniciales(tipo: 'CENTRO' | 'MOVIL'): DatosNegocio {
  return {
    nombreComercial: '',
    descripcion: '',
    direccion: '',
    telefonoNegocio: '',
    whatsapp: '',
    zonaId: null,
    dias: [1, 2, 3, 4, 5, 6],
    abre: tipo === 'CENTRO' ? '08:00' : '07:00',
    cierra: tipo === 'CENTRO' ? '18:00' : '16:00',
    precios: Object.fromEntries(CODIGOS_MATERIAL.map((codigo) => [codigo, filaVacia()])) as Record<
      CodigoMaterial,
      FilaPrecio
    >,
    pagos: tipo === 'CENTRO' ? ['EFECTIVO'] : [],
    vehiculo: 'CAMION',
    fotos: [],
    ubicacion: null,
  };
}

// El borrador guardado en el servidor puede venir incompleto: se mezcla con los valores iniciales
export function mezclarBorrador(tipo: 'CENTRO' | 'MOVIL', guardado: unknown): DatosNegocio {
  const base = datosIniciales(tipo);
  if (!guardado || typeof guardado !== 'object') return base;
  const datos = guardado as Partial<DatosNegocio>;
  return {
    ...base,
    ...datos,
    precios: { ...base.precios, ...(datos.precios ?? {}) },
    dias: Array.isArray(datos.dias) ? datos.dias : base.dias,
    pagos: Array.isArray(datos.pagos) ? datos.pagos : base.pagos,
    fotos: Array.isArray(datos.fotos) ? datos.fotos : base.fotos,
  };
}

const numero = (texto: string) => (texto.trim() === '' ? Number.NaN : Number(texto.replace(',', '.')));
const digitos = (texto: string) => texto.replace(/\D/g, '');

export function preciosParaApi(precios: DatosNegocio['precios']) {
  return Object.fromEntries(
    CODIGOS_MATERIAL.filter((codigo) => precios[codigo].activo).map((codigo) => [
      codigo,
      { min: numero(precios[codigo].min), max: numero(precios[codigo].max), demanda: precios[codigo].demanda },
    ]),
  );
}

// Primer mensaje del esquema compartido: nombra el material, igual que el servidor
export function errorDePrecios(precios: DatosNegocio['precios']): string | null {
  const resultado = esquemaPrecios.safeParse(preciosParaApi(precios));
  return resultado.success ? null : (resultado.error.issues[0]?.message ?? 'Revisa los precios.');
}

export function paraApi(tipo: 'CENTRO' | 'MOVIL', datos: DatosNegocio): unknown {
  const comun = {
    nombreComercial: datos.nombreComercial.trim(),
    descripcion: datos.descripcion.trim() || undefined,
    whatsapp: digitos(datos.whatsapp),
    precios: preciosParaApi(datos.precios),
    zonaId: datos.zonaId ?? 0,
    fotos: datos.fotos,
  };
  if (tipo === 'CENTRO') {
    return {
      tipo,
      ...comun,
      direccion: datos.direccion.trim(),
      ...(datos.ubicacion ? { ubicacion: datos.ubicacion } : {}),
      telefonoNegocio: digitos(datos.telefonoNegocio) || undefined,
      horario: { dias: [...datos.dias].sort(), abre: datos.abre, cierra: datos.cierra },
      pagos: datos.pagos,
    };
  }
  return {
    tipo,
    ...comun,
    vehiculo: datos.vehiculo,
    horario: { abre: datos.abre, cierra: datos.cierra },
    pagos: datos.pagos,
  };
}

export function validarCompleto(tipo: 'CENTRO' | 'MOVIL', datos: DatosNegocio) {
  const esquema = tipo === 'CENTRO' ? esquemaRegistroCentro : esquemaRegistroMovil;
  return esquema.safeParse(paraApi(tipo, datos)) as
    | { success: true; data: RegistroNegocioCompleto }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

export type ErroresPaso = Partial<
  Record<
    | 'nombreComercial'
    | 'direccion'
    | 'telefonoNegocio'
    | 'whatsapp'
    | 'zonaId'
    | 'ubicacion'
    | 'dias'
    | 'cierra'
    | 'precios'
    | 'pagos',
    string
  >
>;

// Validación de cada paso del registro del centro (05), con los textos del prototipo
// Sin mapa disponible (solo fuera de producción) la zona sirve de respaldo y el pin no se exige
export function validarPasoCentro(paso: number, datos: DatosNegocio, pinObligatorio = true): ErroresPaso {
  const errores: ErroresPaso = {};
  if (paso === 1) {
    if (datos.nombreComercial.trim().length < 2) errores.nombreComercial = 'Escribe el nombre del negocio.';
    if (datos.direccion.trim().length < 5) errores.direccion = 'Escribe la dirección del local.';
    if (!/^9\d{8}$/.test(digitos(datos.telefonoNegocio))) errores.telefonoNegocio = 'Ingresa 9 dígitos.';
    if (!/^9\d{8}$/.test(digitos(datos.whatsapp))) errores.whatsapp = 'Ingresa 9 dígitos.';
  }
  if (paso === 2 && !datos.zonaId) errores.zonaId = 'Elige la zona de tu local.';
  if (paso === 2 && pinObligatorio && !datos.ubicacion) errores.ubicacion = 'Coloca el pin de tu local en el mapa.';
  if (paso === 3) {
    if (datos.dias.length === 0) errores.dias = 'Elige al menos un día.';
    if (!(datos.cierra > datos.abre)) errores.cierra = 'La hora de cierre debe ser posterior a la de apertura.';
  }
  if (paso === 4) {
    const precio = errorDePrecios(datos.precios);
    if (precio) errores.precios = precio;
  }
  if (paso === 5 && datos.pagos.length === 0) errores.pagos = 'Elige al menos un método de pago.';
  return errores;
}

// Validación de la pantalla 06, que es de una sola página
export function validarMovil(datos: DatosNegocio): ErroresPaso {
  const errores: ErroresPaso = {};
  if (datos.nombreComercial.trim().length < 2) errores.nombreComercial = 'Escribe tu nombre o el de tu negocio.';
  if (!/^9\d{8}$/.test(digitos(datos.whatsapp))) errores.whatsapp = 'Ingresa 9 dígitos.';
  const precio = errorDePrecios(datos.precios);
  if (precio) errores.precios = precio;
  if (!datos.zonaId) errores.zonaId = 'Elige tu zona de trabajo.';
  if (!(datos.cierra > datos.abre)) errores.cierra = 'Debe ser posterior.';
  return errores;
}

// Datos del negocio ya enviado, para corregirlos tras un pedido del administrador
export type NegocioEnviado = {
  tipo: 'CENTRO' | 'MOVIL';
  nombreComercial: string;
  descripcion: string | null;
  direccion: string | null;
  telefonoNegocio: string | null;
  whatsapp: string;
  vehiculo: Vehiculo | null;
  zona: { id: number; nombre: string } | null;
  horarios: Array<{ dia: number; abre: string; cierra: string }>;
  horaInicio: string | null;
  horaFin: string | null;
  pagos: MetodoPago[];
  fotos: string[];
  ubicacion: { lat: number; lng: number } | null;
  precios: Array<{ material: { codigo: CodigoMaterial; nombre: string }; min: string; max: string; demanda: Demanda }>;
};

export function desdeEnviado(negocio: NegocioEnviado): DatosNegocio {
  const base = datosIniciales(negocio.tipo);
  const precios = { ...base.precios };
  for (const precio of negocio.precios) {
    precios[precio.material.codigo] = { activo: true, min: precio.min, max: precio.max, demanda: precio.demanda };
  }
  // El móvil guarda su horario habitual sin días; el centro, un horario por día
  const primero =
    negocio.tipo === 'MOVIL' && negocio.horaInicio && negocio.horaFin
      ? { abre: negocio.horaInicio, cierra: negocio.horaFin }
      : negocio.horarios[0];
  return {
    ...base,
    nombreComercial: negocio.nombreComercial,
    descripcion: negocio.descripcion ?? '',
    direccion: negocio.direccion ?? '',
    telefonoNegocio: negocio.telefonoNegocio ?? '',
    whatsapp: negocio.whatsapp,
    zonaId: negocio.zona?.id ?? null,
    dias: negocio.tipo === 'MOVIL' ? base.dias : negocio.horarios.map((horario) => horario.dia),
    abre: primero?.abre ?? base.abre,
    cierra: primero?.cierra ?? base.cierra,
    precios,
    pagos: negocio.pagos,
    vehiculo: negocio.vehiculo ?? base.vehiculo,
    fotos: negocio.fotos,
    ubicacion: negocio.ubicacion,
  };
}
