import type { CodigoMaterial } from '@reciclomap/shared';

// D2: historial real. Kilos, puntos, giros, niveles y promedios salen de estas operaciones y sus calificaciones
type Resena = [estrellas: number, etiquetas: string[], comentario?: string];

export type OperacionHistorica = {
  telefono: string;
  negocio: string;
  material: CodigoMaterial;
  kg: number;
  precioKg: number;
  haceDias: number;
  alNegocio: Resena;
  alReciclador: Resena;
  respuesta?: string;
};

const MARCO = '900000001';
const LUCIA = '900000002';
const JULIO = '900000003';
const ELENA = '900000004';

const op = (
  telefono: string,
  negocio: string,
  material: CodigoMaterial,
  kg: number,
  precioKg: number,
  haceDias: number,
  alNegocio: Resena,
  alReciclador: Resena,
  respuesta?: string,
): OperacionHistorica => ({ telefono, negocio, material, kg, precioKg, haceDias, alNegocio, alReciclador, respuesta });

export const HISTORIAL: OperacionHistorica[] = [
  // Marco Quispe: 10 operaciones, 468 kg (pantalla 28)
  op(MARCO, 'EcoAcopio Juliaca', 'carton', 30, 0.65, 95, [4, ['buen_trato']], [5, ['material_limpio', 'puntual']]),
  op(MARCO, 'Reciclajes San Román', 'metal', 20, 2.0, 87, [4, ['precio_justo']], [5, ['bien_separado']]),
  op(MARCO, 'Camioneta Juli Verde', 'pet', 48, 2.6, 80, [5, ['puntual', 'pago_lo_acordado']], [5, ['material_limpio']]),
  op(MARCO, 'Camión Los Andes', 'carton', 70, 0.6, 75, [4, ['puntual']], [4, ['peso_correcto']]),
  op(
    MARCO,
    'Acopio Titicaca',
    'papel',
    55,
    0.45,
    68,
    [5, ['peso_frente_a_mi', 'pago_lo_acordado'], 'Pesaron frente a mí y pagaron lo acordado.'],
    [5, ['bien_separado', 'puntual']],
    'Gracias, Marco. Te esperamos con más papel.',
  ),
  op(
    MARCO,
    'Acopio Cerro Colorado',
    'pet',
    80,
    2.9,
    61,
    [5, ['precio_justo'], 'Precio como el publicado. Recomendado.'],
    [5, ['material_limpio']],
  ),
  op(MARCO, 'Compras Rubén', 'pet', 38, 1.15, 55, [4, ['puntual']], [5, ['buen_trato']]),
  op(MARCO, 'Acopio Cerro Colorado', 'metal', 25, 3.0, 48, [5, ['atencion_rapida']], [4, ['peso_correcto']]),
  op(
    MARCO,
    'EcoAcopio Juliaca',
    'pet',
    42,
    2.2,
    43,
    [4, ['buen_trato'], 'Buen trato, algo de espera en la báscula.'],
    [5, ['material_limpio', 'bien_separado']],
    'Gracias, estamos mejorando la fila en horas pico.',
  ),
  op(
    MARCO,
    'Acopio Titicaca',
    'carton',
    60,
    0.7,
    38,
    [5, ['pago_lo_acordado'], 'Material recibido sin problemas y pago al instante.'],
    [5, ['puntual', 'material_limpio']],
  ),
  // Lucía Condori: 12 operaciones, 640 kg
  op(LUCIA, 'Acopio Titicaca', 'pet', 70, 2.5, 92, [5, ['puntual']], [5, ['material_limpio']]),
  op(LUCIA, 'EcoAcopio Juliaca', 'carton', 55, 0.6, 88, [4, ['precio_justo']], [5, ['bien_separado']]),
  op(
    LUCIA,
    'Reciclajes San Román',
    'papel',
    48,
    0.4,
    83,
    [3, ['buen_trato'], 'Pagaron bien pero tardaron en atender.'],
    [5, ['puntual']],
  ),
  op(LUCIA, 'Acopio Cerro Colorado', 'pet', 62, 2.8, 77, [5, ['pago_lo_acordado']], [5, ['material_limpio']]),
  op(LUCIA, 'Recicla Puno Sur', 'metal', 40, 2.4, 71, [4, ['puntual']], [4, ['peso_correcto']]),
  op(LUCIA, 'Compras Rubén', 'carton', 58, 0.55, 66, [5, ['atencion_rapida', 'precio_justo']], [5, ['bien_separado']]),
  op(LUCIA, 'Camión Los Andes', 'plastico', 45, 1.0, 59, [5, ['puntual']], [5, ['material_limpio']]),
  op(LUCIA, 'Triciclo Marcos', 'papel', 60, 0.38, 52, [4, ['buen_trato']], [4, ['puntual']]),
  op(LUCIA, 'Acopio Titicaca', 'metal', 52, 2.7, 45, [5, ['peso_frente_a_mi']], [5, ['bien_separado']]),
  op(LUCIA, 'EcoAcopio Juliaca', 'pet', 50, 2.3, 36, [4, ['pago_lo_acordado']], [5, ['material_limpio']]),
  op(LUCIA, 'Reciclajes San Román', 'carton', 48, 0.58, 29, [4, ['precio_justo']], [5, ['puntual']]),
  op(LUCIA, 'Recicla Puno Sur', 'pet', 52, 2.35, 21, [5, ['puntual']], [5, ['material_limpio', 'bien_separado']]),
  // Julio Apaza: 8 operaciones, 230 kg
  op(JULIO, 'Acopio Cerro Colorado', 'carton', 30, 0.6, 70, [4, ['puntual']], [4, ['puntual']]),
  op(JULIO, 'Recicla Puno Sur', 'papel', 25, 0.42, 63, [4, ['buen_trato']], [4, ['peso_correcto']]),
  op(JULIO, 'Triciclo Marcos', 'pet', 35, 2.3, 56, [5, ['precio_justo']], [5, ['material_limpio']]),
  op(JULIO, 'Compras Rubén', 'metal', 28, 2.5, 49, [4, ['puntual']], [4, ['buen_trato']]),
  op(
    JULIO,
    'Camión Los Andes',
    'papel',
    32,
    0.4,
    40,
    [3, ['buen_trato'], 'Llegaron una hora tarde.'],
    [4, ['puntual']],
  ),
  op(JULIO, 'Camioneta Juli Verde', 'plastico', 25, 1.1, 33, [4, ['pago_lo_acordado']], [5, ['bien_separado']]),
  op(JULIO, 'Acopio Titicaca', 'carton', 30, 0.7, 24, [5, ['atencion_rapida']], [5, ['material_limpio']]),
  op(JULIO, 'Reciclajes San Román', 'pet', 25, 2.2, 15, [4, ['precio_justo']], [4, ['peso_correcto']]),
  // Elena Huanca: su primera operación
  op(
    ELENA,
    'Triciclo Marcos',
    'carton',
    20,
    0.5,
    12,
    [5, ['buen_trato'], 'Muy amable, recogió en mi casa a la hora.'],
    [5, ['bien_separado']],
  ),
];

export type OperacionCancelada = {
  telefono: string;
  negocio: string;
  material: CodigoMaterial;
  kg: number;
  precioKg: number;
  haceDias: number;
  motivo: string;
  porNegocio: boolean;
};

export const CANCELADAS: OperacionCancelada[] = [
  {
    telefono: MARCO,
    negocio: 'Reciclajes San Román',
    material: 'papel',
    kg: 20,
    precioKg: 0.4,
    haceDias: 58,
    motivo: 'Ya vendí el material',
    porNegocio: false,
  },
  {
    telefono: MARCO,
    negocio: 'Compras Rubén',
    material: 'pet',
    kg: 30,
    precioKg: 2.5,
    haceDias: 76,
    motivo: 'La otra persona no responde',
    porNegocio: true,
  },
];

// En curso, para demostrar el cierre: una espera "Recibí" y otra la conformidad del reciclador
export type OperacionEnCurso = {
  telefono: string;
  negocio: string;
  material: CodigoMaterial;
  kg: number;
  precioKg: number;
  estado: 'ENTREGADA' | 'CONFIRMADA';
  horas: number;
  kgFinal?: number;
};

export const EN_CURSO: OperacionEnCurso[] = [
  { telefono: LUCIA, negocio: 'Compras Rubén', material: 'pet', kg: 25, precioKg: 2.45, estado: 'ENTREGADA', horas: 3 },
  {
    telefono: MARCO,
    negocio: 'Acopio Titicaca',
    material: 'carton',
    kg: 40,
    precioKg: 0.68,
    estado: 'CONFIRMADA',
    horas: 20,
    kgFinal: 38,
  },
];
