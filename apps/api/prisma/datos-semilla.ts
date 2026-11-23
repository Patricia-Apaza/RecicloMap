// Datos ficticios de Juliaca. Teléfonos del rango 900 000 0xx y correos ".test": no pertenecen a nadie.

export const CIUDADES = [
  { nombre: 'Juliaca', region: 'Puno', activa: true, verificadores: true, precios: true },
  { nombre: 'Puno', region: 'Puno', activa: false, verificadores: true, precios: true },
  { nombre: 'Arequipa', region: 'Arequipa', activa: false, verificadores: false, precios: false },
  { nombre: 'Cusco', region: 'Cusco', activa: false, verificadores: false, precios: false },
  { nombre: 'Tacna', region: 'Tacna', activa: false, verificadores: false, precios: false },
] as const;

// Punto de partida del reciclador de ejemplo; las demás posiciones se dan en km respecto de él
export const ORIGEN = { lat: -15.493, lng: -70.129 };

export const ZONAS_JULIACA = [
  { nombre: 'Barrio Santa Rosa', este: 0.4, sur: 0.6 },
  { nombre: 'Centro de Juliaca', este: -1.0, sur: -0.8 },
  { nombre: 'Mercado Santa Bárbara', este: -2.0, sur: -1.6 },
  { nombre: 'Mariano Melgar', este: -2.4, sur: 1.5 },
  { nombre: 'Cerro Colorado', este: 3.6, sur: -2.2 },
  { nombre: 'Salida a Puno', este: -4.8, sur: -3.1 },
  { nombre: 'Zona industrial', este: -3.0, sur: -1.2 },
  { nombre: 'La Rinconada', este: 2.4, sur: 3.1 },
  { nombre: 'Carretera a Cusco', este: 6.5, sur: 2.4 },
  { nombre: 'Salida a Ilave', este: 12.0, sur: -6.0 },
  { nombre: 'Túpac Amaru', este: 1.8, sur: -3.0 },
  { nombre: 'Santa Catalina', este: -1.6, sur: 2.6 },
] as const;

export const MATERIALES = [
  { codigo: 'pet', nombre: 'PET' },
  { codigo: 'carton', nombre: 'Cartón' },
  { codigo: 'papel', nombre: 'Papel' },
  { codigo: 'plastico', nombre: 'Plástico duro' },
  { codigo: 'metal', nombre: 'Metales' },
] as const;

export type CodigoMaterial = (typeof MATERIALES)[number]['codigo'];

export const NIVELES = [
  { id: 1, nombre: 'Semilla', kgMin: 0 },
  { id: 2, nombre: 'Brote', kgMin: 50 },
  { id: 3, nombre: 'Recolector', kgMin: 200 },
  { id: 4, nombre: 'Guardián', kgMin: 500 },
  { id: 5, nombre: 'Maestro', kgMin: 1000 },
  { id: 6, nombre: 'Leyenda', kgMin: 2500 },
] as const;

export const INSIGNIAS = [
  {
    codigo: 'semilla',
    nombre: 'Semilla',
    categoria: 'KILOS',
    descripcion: 'Verifica tu teléfono y empieza a reciclar.',
    meta: 1,
    unidad: 'registro',
    destacada: false,
  },
  {
    codigo: 'recolector',
    nombre: 'Recolector',
    categoria: 'KILOS',
    descripcion: 'Llega a 200 kg reciclados.',
    meta: 200,
    unidad: 'kg',
    destacada: false,
  },
  {
    codigo: 'guardian',
    nombre: 'Guardián',
    categoria: 'KILOS',
    descripcion: 'Llega a 500 kg reciclados.',
    meta: 500,
    unidad: 'kg',
    destacada: false,
  },
  {
    codigo: 'maestro',
    nombre: 'Maestro',
    categoria: 'KILOS',
    descripcion: 'Llega a 1000 kg reciclados.',
    meta: 1000,
    unidad: 'kg',
    destacada: false,
  },
  {
    codigo: 'racha_4_semanas',
    nombre: 'Racha de 4 semanas',
    categoria: 'CONSTANCIA',
    descripcion: 'Completa una operación o un registro confirmado cada semana durante 4 semanas seguidas.',
    meta: 4,
    unidad: 'semanas',
    destacada: true,
  },
  {
    codigo: 'madrugador',
    nombre: 'Madrugador',
    categoria: 'CONSTANCIA',
    descripcion: 'Completa 5 operaciones cuya recepción se confirmó antes de las 9:00.',
    meta: 5,
    unidad: 'operaciones',
    destacada: false,
  },
  {
    codigo: 'reciclador_confiable',
    nombre: 'Reciclador Confiable',
    categoria: 'CALIDAD',
    descripcion: '4,5 de calificación y 10 operaciones.',
    meta: 10,
    unidad: 'operaciones',
    destacada: true,
  },
  {
    codigo: 'material_impecable',
    nombre: 'Material impecable',
    categoria: 'CALIDAD',
    descripcion: '5 reseñas que destacan material limpio o bien separado.',
    meta: 5,
    unidad: 'reseñas',
    destacada: false,
  },
  {
    codigo: 'cazador_de_precios',
    nombre: 'Cazador de precios',
    categoria: 'PRECIO',
    descripcion: 'Acepta 5 veces la oferta de mayor total.',
    meta: 5,
    unidad: 'veces',
    destacada: true,
  },
  {
    codigo: 'embajador',
    nombre: 'Embajador',
    categoria: 'COMUNIDAD',
    descripcion: 'Invita a 3 amigos recicladores.',
    meta: 3,
    unidad: 'amigos',
    destacada: true,
  },
  {
    codigo: 'primer_giro',
    nombre: 'Primer giro',
    categoria: 'JUEGO',
    descripcion: 'Gira la ruleta por primera vez.',
    meta: 1,
    unidad: 'giro',
    destacada: false,
  },
  {
    codigo: 'cazador_de_desafios',
    nombre: 'Cazador de desafíos',
    categoria: 'JUEGO',
    descripcion: 'Reclama al menos un desafío en 3 meses distintos.',
    meta: 3,
    unidad: 'meses',
    destacada: false,
  },
] as const;

export const ETIQUETAS = {
  NEGOCIO: ['Puntual', 'Pagó lo acordado', 'Buen trato', 'Pesó frente a mí', 'Precio justo', 'Atención rápida'],
  RECICLADOR: ['Material limpio', 'Bien separado', 'Puntual', 'Peso correcto', 'Buen trato'],
} as const;

export const PLANTILLAS_DESAFIO = [
  {
    codigo: 'meta_del_mes',
    nombre: 'Recicla 100 kg este mes',
    descripcion: 'Suma 100 kg en operaciones completadas o entregas directas confirmadas.',
    tipo: 'KG_TOTAL',
    material: null,
    meta: 100,
    unidad: 'kg',
    puntos: 30,
    esMetaMes: true,
  },
  {
    codigo: 'mes_del_carton',
    nombre: 'Mes del cartón',
    descripcion: 'Suma 80 kg de cartón en operaciones completadas.',
    tipo: 'KG_MATERIAL',
    material: 'carton',
    meta: 80,
    unidad: 'kg',
    puntos: 40,
    esMetaMes: false,
  },
  {
    codigo: 'pet_limpio',
    nombre: 'PET limpio',
    descripcion: 'Completa 2 operaciones de PET este mes.',
    tipo: 'OPERACIONES_MATERIAL',
    material: 'pet',
    meta: 2,
    unidad: 'operaciones',
    puntos: 25,
    esMetaMes: false,
  },
  {
    codigo: 'primera_calificacion',
    nombre: 'Primera calificación',
    descripcion: 'Califica a un comprador después de una operación.',
    tipo: 'CALIFICACIONES',
    material: null,
    meta: 1,
    unidad: 'calificación',
    puntos: 15,
    esMetaMes: false,
  },
  {
    codigo: 'constancia',
    nombre: 'Constancia',
    descripcion: 'Publica material en 3 días distintos. No cuentan las publicaciones que canceles.',
    tipo: 'DIAS_PUBLICANDO',
    material: null,
    meta: 3,
    unidad: 'días',
    puntos: 30,
    esMetaMes: false,
  },
  {
    codigo: 'metales_a_tiempo',
    nombre: 'Metales a tiempo',
    descripcion: 'Entrega 30 kg de metales.',
    tipo: 'KG_MATERIAL',
    material: 'metal',
    meta: 30,
    unidad: 'kg',
    puntos: 50,
    esMetaMes: false,
  },
] as const;

const ENTREGA = 'Acopio Titicaca, Jr. Moquegua 450, Juliaca';

export const PREMIOS = [
  { nombre: '+20 puntos', tipo: 'PUNTOS', puntos: 20, probabilidad: 15, stock: null, patrocinador: null },
  { nombre: 'Bolsas reutilizables', tipo: 'OBJETO', puntos: null, probabilidad: 12, stock: 40, patrocinador: null },
  { nombre: '+50 puntos', tipo: 'PUNTOS', puntos: 50, probabilidad: 5, stock: null, patrocinador: null },
  { nombre: 'Gorra RecicloMap', tipo: 'OBJETO', puntos: null, probabilidad: 8, stock: 15, patrocinador: null },
  { nombre: 'Sigue intentando', tipo: 'SIN_PREMIO', puntos: null, probabilidad: 20, stock: null, patrocinador: null },
  { nombre: 'Kit escolar', tipo: 'OBJETO', puntos: null, probabilidad: 5, stock: 10, patrocinador: 'Aliado' },
  { nombre: '+10 puntos', tipo: 'PUNTOS', puntos: 10, probabilidad: 25, stock: null, patrocinador: null },
  { nombre: 'Botella reutilizable', tipo: 'OBJETO', puntos: null, probabilidad: 10, stock: 25, patrocinador: null },
] as const;

export const PREMIO_ENTREGA = { punto: ENTREGA, vigenciaDias: 30 };

export const PARAMETROS = [
  { clave: 'vigencia_publicacion_dias', valor: '7', descripcion: 'Días que dura una publicación' },
  { clave: 'plazo_aviso_entrega_horas', valor: '72', descripcion: 'Horas en ENTREGADA antes de avisar a ambas partes' },
  { clave: 'plazo_conformidad_horas', valor: '72', descripcion: 'Horas en CONFIRMADA antes del cierre automático' },
  { clave: 'tope_diario_registro_directo', valor: '150', descripcion: 'Puntos máximos por día por registro directo' },
  { clave: 'registro_directo_vigencia_dias', valor: '7', descripcion: 'Días para confirmar un registro directo' },
  { clave: 'registro_directo_max_pendientes', valor: '3', descripcion: 'Registros directos pendientes por reciclador' },
  { clave: 'puntos_por_kg', valor: '1', descripcion: 'Puntos por kg reciclado' },
  { clave: 'puntos_por_giro', valor: '500', descripcion: 'Puntos por reciclaje que dan un giro' },
  {
    clave: 'puntos_por_invitacion',
    valor: '10',
    descripcion: 'Puntos de bono para cada parte cuando el invitado completa su primera operación',
  },
  {
    clave: 'premio_aviso_dias',
    valor: '3',
    descripcion: 'Días antes del vencimiento en que se avisa de un premio sin reclamar',
  },
  { clave: 'meta_mes_kg', valor: '100', descripcion: 'Kilos de la Meta del mes' },
  { clave: 'dias_precio_al_dia', valor: '7', descripcion: 'Días tras los cuales un precio se muestra como antiguo' },
  { clave: 'precio_kg_minimo', valor: '0.10', descripcion: 'Precio mínimo por kg, en soles' },
  { clave: 'precio_kg_maximo', valor: '50.00', descripcion: 'Precio máximo por kg, en soles' },
  { clave: 'radio_defecto_km', valor: '5', descripcion: 'Radio de búsqueda por defecto' },
  { clave: 'radio_maximo_km', valor: '20', descripcion: 'Radio de búsqueda máximo' },
  {
    clave: 'radio_visibilidad_km',
    valor: '0',
    descripcion: 'Radio máximo para ver publicaciones; 0 es toda la ciudad',
  },
  {
    clave: 'radio_aviso_publicacion_km',
    valor: '5',
    descripcion: 'Distancia máxima para avisar a un negocio de una nueva publicación',
  },
  {
    clave: 'colusion_operaciones_par_7_dias',
    valor: '3',
    descripcion: 'Operaciones completadas entre el mismo reciclador y negocio en 7 días que generan alerta',
  },
  {
    clave: 'colusion_desvio_peso_pct',
    valor: '40',
    descripcion: 'Diferencia porcentual entre kilos publicados y recibidos que genera alerta',
  },
  {
    clave: 'colusion_kg_operacion',
    valor: '500',
    descripcion: 'Kilos recibidos en una sola operación que generan alerta',
  },
  { clave: 'registro_abierto', valor: 'true', descripcion: 'Permite el registro de nuevos usuarios' },
  { clave: 'modo_mantenimiento', valor: 'false', descripcion: 'Muestra la pantalla de mantenimiento' },
] as const;

type Demanda = 'ALTA' | 'MEDIA' | 'BAJA';
type Precio = { min: number; max: number; demanda: Demanda; diasSinActualizar: number };
type Pago = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';

export type NegocioSemilla = {
  tipo: 'CENTRO' | 'MOVIL';
  nombre: string;
  telefono: string;
  correo: string;
  pro: boolean;
  este: number;
  sur: number;
  zona: string;
  direccion?: string;
  vehiculo?: 'MOTO' | 'TRICICLO' | 'CAMIONETA' | 'CAMION';
  disponibilidad?: 'DISPONIBLE' | 'EN_RUTA' | 'FUERA_DE_SERVICIO';
  abre: string;
  cierra: string;
  pagos: Pago[];
  precios: Partial<Record<CodigoMaterial, Precio>>;
  verificacion?: { estado: 'EN_REVISION' | 'INFO_PEDIDA'; motivo?: string; mensaje?: string };
};

const p = (min: number, max: number, demanda: Demanda, diasSinActualizar: number): Precio => ({
  min,
  max,
  demanda,
  diasSinActualizar,
});

export const NEGOCIOS: NegocioSemilla[] = [
  {
    tipo: 'CENTRO',
    nombre: 'Acopio Titicaca',
    telefono: '900000011',
    correo: 'titicaca@reciclomap.test',
    pro: true,
    este: -1.1,
    sur: -0.9,
    zona: 'Centro de Juliaca',
    direccion: 'Jr. Moquegua 450, Juliaca',
    abre: '08:00',
    cierra: '18:00',
    pagos: ['EFECTIVO', 'YAPE', 'PLIN'],
    precios: {
      pet: p(2.5, 2.8, 'ALTA', 1),
      carton: p(0.55, 0.7, 'MEDIA', 1),
      papel: p(0.4, 0.5, 'BAJA', 3),
      plastico: p(1.0, 1.3, 'MEDIA', 2),
      metal: p(2.6, 3.0, 'ALTA', 1),
    },
  },
  {
    tipo: 'CENTRO',
    nombre: 'EcoAcopio Juliaca',
    telefono: '900000012',
    correo: 'ecoacopio@reciclomap.test',
    pro: false,
    este: 1.6,
    sur: 0.7,
    zona: 'Barrio Santa Rosa',
    direccion: 'Av. Independencia 1120, Juliaca',
    abre: '07:30',
    cierra: '17:30',
    pagos: ['EFECTIVO', 'YAPE'],
    precios: {
      pet: p(2.0, 2.4, 'MEDIA', 2),
      carton: p(0.6, 0.7, 'ALTA', 4),
      papel: p(0.3, 0.4, 'MEDIA', 2),
      plastico: p(0.9, 1.1, 'BAJA', 6),
      metal: p(2.2, 2.6, 'MEDIA', 3),
    },
  },
  {
    tipo: 'CENTRO',
    nombre: 'Reciclajes San Román',
    telefono: '900000013',
    correo: 'sanroman@reciclomap.test',
    pro: false,
    este: -2.4,
    sur: 1.5,
    zona: 'Mariano Melgar',
    direccion: 'Jr. Lambayeque 780, Juliaca',
    abre: '08:00',
    cierra: '17:00',
    pagos: ['EFECTIVO'],
    precios: {
      pet: p(2.2, 2.6, 'ALTA', 3),
      carton: p(0.4, 0.55, 'BAJA', 5),
      papel: p(0.3, 0.45, 'BAJA', 5),
      plastico: p(0.8, 1.0, 'MEDIA', 3),
      metal: p(1.8, 2.2, 'BAJA', 7),
    },
  },
  {
    tipo: 'CENTRO',
    nombre: 'Acopio Cerro Colorado',
    telefono: '900000014',
    correo: 'cerrocolorado@reciclomap.test',
    pro: true,
    este: 3.6,
    sur: -2.2,
    zona: 'Cerro Colorado',
    direccion: 'Av. Circunvalación Norte s/n, Juliaca',
    abre: '08:00',
    cierra: '19:00',
    pagos: ['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA'],
    precios: {
      pet: p(2.6, 3.0, 'MEDIA', 1),
      carton: p(0.6, 0.75, 'MEDIA', 1),
      papel: p(0.45, 0.5, 'ALTA', 1),
      plastico: p(1.1, 1.4, 'ALTA', 2),
      metal: p(2.8, 3.1, 'MEDIA', 1),
    },
  },
  {
    tipo: 'CENTRO',
    nombre: 'Recicla Puno Sur',
    telefono: '900000015',
    correo: 'punosur@reciclomap.test',
    pro: false,
    este: -4.8,
    sur: -3.1,
    zona: 'Salida a Puno',
    direccion: 'Jr. Cusco 215, Juliaca',
    abre: '14:00',
    cierra: '19:00',
    pagos: ['EFECTIVO', 'YAPE'],
    precios: {
      pet: p(1.9, 2.2, 'BAJA', 9),
      carton: p(0.35, 0.5, 'BAJA', 9),
      papel: p(0.25, 0.35, 'BAJA', 9),
      plastico: p(0.7, 0.9, 'BAJA', 9),
      metal: p(1.5, 1.9, 'BAJA', 9),
    },
  },
  {
    tipo: 'MOVIL',
    nombre: 'Compras Rubén',
    telefono: '900000021',
    correo: 'comprasruben@reciclomap.test',
    pro: false,
    este: 0.6,
    sur: 1.9,
    zona: 'Barrio Santa Rosa',
    vehiculo: 'MOTO',
    disponibilidad: 'DISPONIBLE',
    abre: '07:00',
    cierra: '18:00',
    pagos: ['EFECTIVO', 'YAPE'],
    precios: { pet: p(2.3, 2.6, 'ALTA', 1), carton: p(0.5, 0.6, 'MEDIA', 2), metal: p(2.4, 2.7, 'MEDIA', 1) },
  },
  {
    tipo: 'MOVIL',
    nombre: 'Camión Los Andes',
    telefono: '900000022',
    correo: 'losandes@reciclomap.test',
    pro: false,
    este: -3.0,
    sur: -1.2,
    zona: 'Zona industrial',
    vehiculo: 'CAMION',
    disponibilidad: 'EN_RUTA',
    abre: '06:00',
    cierra: '16:00',
    pagos: ['EFECTIVO', 'TRANSFERENCIA'],
    precios: {
      pet: p(2.4, 2.7, 'MEDIA', 1),
      carton: p(0.55, 0.65, 'ALTA', 1),
      papel: p(0.4, 0.5, 'MEDIA', 2),
      plastico: p(1.0, 1.2, 'MEDIA', 1),
    },
  },
  {
    tipo: 'MOVIL',
    nombre: 'Triciclo Marcos',
    telefono: '900000023',
    correo: 'triciclomarcos@reciclomap.test',
    pro: false,
    este: 2.4,
    sur: 3.1,
    zona: 'La Rinconada',
    vehiculo: 'TRICICLO',
    disponibilidad: 'FUERA_DE_SERVICIO',
    abre: '09:00',
    cierra: '13:00',
    pagos: ['EFECTIVO'],
    precios: { pet: p(2.1, 2.3, 'BAJA', 4), carton: p(0.4, 0.5, 'BAJA', 4), papel: p(0.3, 0.35, 'BAJA', 4) },
  },
  {
    tipo: 'MOVIL',
    nombre: 'Camioneta Juli Verde',
    telefono: '900000024',
    correo: 'juliverde@reciclomap.test',
    pro: false,
    este: 6.5,
    sur: 2.4,
    zona: 'Carretera a Cusco',
    vehiculo: 'CAMIONETA',
    disponibilidad: 'DISPONIBLE',
    abre: '08:00',
    cierra: '17:00',
    pagos: ['EFECTIVO', 'YAPE', 'PLIN'],
    precios: { pet: p(2.45, 2.75, 'MEDIA', 2), plastico: p(0.95, 1.15, 'MEDIA', 2), metal: p(2.5, 2.8, 'MEDIA', 2) },
  },
  {
    tipo: 'MOVIL',
    nombre: 'Acopio Ilave Móvil',
    telefono: '900000025',
    correo: 'ilavemovil@reciclomap.test',
    pro: false,
    este: 12.0,
    sur: -6.0,
    zona: 'Salida a Ilave',
    vehiculo: 'CAMIONETA',
    disponibilidad: 'DISPONIBLE',
    abre: '07:00',
    cierra: '17:00',
    pagos: ['EFECTIVO', 'TRANSFERENCIA'],
    precios: { pet: p(2.7, 3.1, 'ALTA', 3), carton: p(0.6, 0.7, 'MEDIA', 3), metal: p(2.9, 3.2, 'ALTA', 3) },
  },
  // Pendientes de verificación: aparecen en la cola del administrador y no en el mapa
  {
    tipo: 'CENTRO',
    nombre: 'Acopio Los Pinos',
    telefono: '900000016',
    correo: 'lospinos@reciclomap.test',
    pro: false,
    este: 1.8,
    sur: -2.6,
    zona: 'Túpac Amaru',
    direccion: 'Av. Los Pinos 330, Juliaca',
    abre: '08:00',
    cierra: '17:00',
    pagos: ['EFECTIVO', 'YAPE', 'PLIN'],
    precios: { pet: p(2.4, 2.7, 'MEDIA', 0), plastico: p(0.9, 1.1, 'MEDIA', 0), papel: p(0.3, 0.4, 'BAJA', 0) },
    verificacion: { estado: 'EN_REVISION' },
  },
  {
    tipo: 'CENTRO',
    nombre: 'Reciclajes Sur',
    telefono: '900000017',
    correo: 'reciclajessur@reciclomap.test',
    pro: false,
    este: -4.2,
    sur: -2.7,
    zona: 'Salida a Puno',
    direccion: 'Jr. Arequipa 512, Juliaca',
    abre: '09:00',
    cierra: '18:00',
    pagos: ['EFECTIVO'],
    precios: { carton: p(0.45, 0.6, 'ALTA', 0), metal: p(2.0, 2.4, 'MEDIA', 0) },
    verificacion: {
      estado: 'INFO_PEDIDA',
      motivo: 'Falta foto del local',
      mensaje: 'Sube una foto de la fachada con buena luz.',
    },
  },
];

export const RECICLADOR = {
  nombre: 'Marco Quispe',
  telefono: '900000001',
  correo: 'marco.quispe@reciclomap.test',
  zona: 'Barrio Santa Rosa',
  materiales: ['pet', 'carton', 'metal'] as CodigoMaterial[],
  rachaSemanas: 4,
  codigoInvitacion: 'RECI-MQ48',
};

export const ADMIN = { nombre: 'Administración', telefono: '900000099', correo: 'admin@reciclomap.test' };

// Recicladores ficticios con publicaciones abiertas, para que los negocios vean material cerca
export const RECICLADORES_DEMO = [
  {
    nombre: 'Lucía Condori',
    telefono: '900000002',
    codigo: 'RECI-LC64',
  },
  {
    nombre: 'Julio Apaza',
    telefono: '900000003',
    codigo: 'RECI-JA23',
  },
  {
    nombre: 'Elena Huanca',
    telefono: '900000004',
    codigo: 'RECI-EH02',
  },
];

type OfertaSemilla = { negocio: string; precioKg: number; mensaje: string; estado?: 'ACEPTADA' | 'NO_SELECCIONADA' };
export type PublicacionSemilla = {
  telefono: string;
  material: CodigoMaterial;
  kg: number;
  precioEsperado?: number;
  nota?: string;
  este: number;
  sur: number;
  haceDias: number;
  estado: 'DISPONIBLE' | 'CON_OFERTAS' | 'EN_NEGOCIACION' | 'VENCIDA' | 'CANCELADA';
  motivo?: string;
  ofertas?: OfertaSemilla[];
};

// Las del reciclador de ejemplo cubren cada pestaña de la 13 y la operación aceptada
export const PUBLICACIONES: PublicacionSemilla[] = [
  {
    telefono: '900000001',
    material: 'pet',
    kg: 35,
    precioEsperado: 2.6,
    nota: 'Botellas limpias y aplastadas, en costales.',
    este: 0.4,
    sur: 0.6,
    haceDias: 2,
    estado: 'CON_OFERTAS',
    ofertas: [
      { negocio: 'Acopio Titicaca', precioKg: 2.7, mensaje: 'Puedo recoger hoy por la tarde.' },
      { negocio: 'Compras Rubén', precioKg: 2.55, mensaje: 'Paso mañana temprano por tu zona.' },
      { negocio: 'Acopio Cerro Colorado', precioKg: 2.85, mensaje: 'Pago en efectivo o Yape. Recojo mañana.' },
    ],
  },
  { telefono: '900000001', material: 'carton', kg: 60, este: 0.4, sur: 0.6, haceDias: 1, estado: 'DISPONIBLE' },
  {
    telefono: '900000001',
    material: 'metal',
    kg: 18,
    precioEsperado: 2.8,
    este: 0.4,
    sur: 0.6,
    haceDias: 4,
    estado: 'EN_NEGOCIACION',
    ofertas: [
      { negocio: 'EcoAcopio Juliaca', precioKg: 2.6, mensaje: 'Te espero en el local.', estado: 'ACEPTADA' },
      { negocio: 'Camión Los Andes', precioKg: 2.4, mensaje: 'Puedo pasar el viernes.', estado: 'NO_SELECCIONADA' },
    ],
  },
  { telefono: '900000001', material: 'papel', kg: 25, este: 0.4, sur: 0.6, haceDias: 9, estado: 'VENCIDA' },
  {
    telefono: '900000001',
    material: 'carton',
    kg: 45,
    precioEsperado: 0.6,
    este: 0.4,
    sur: 0.6,
    haceDias: 5,
    estado: 'CANCELADA',
    motivo: 'Cambié de planes',
  },
  {
    telefono: '900000002',
    material: 'pet',
    kg: 42,
    precioEsperado: 2.5,
    este: -0.8,
    sur: 1.2,
    haceDias: 1,
    estado: 'DISPONIBLE',
  },
  { telefono: '900000002', material: 'plastico', kg: 30, este: -0.8, sur: 1.2, haceDias: 5, estado: 'DISPONIBLE' },
  {
    telefono: '900000003',
    material: 'metal',
    kg: 25,
    precioEsperado: 2.7,
    nota: 'Latas y fierro delgado, separados.',
    este: 2.1,
    sur: -1.4,
    haceDias: 4,
    estado: 'DISPONIBLE',
  },
  {
    telefono: '900000004',
    material: 'papel',
    kg: 50,
    precioEsperado: 0.35,
    este: -2.6,
    sur: 2.9,
    haceDias: 3,
    estado: 'DISPONIBLE',
  },
];
