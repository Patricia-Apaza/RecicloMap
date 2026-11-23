// Fase 12B: parámetros que la administración puede editar. El servidor y la base validan el mismo rango
export type GrupoParametro =
  | 'busqueda'
  | 'publicaciones'
  | 'operaciones'
  | 'avisos'
  | 'reportes'
  | 'colusion'
  | 'plan'
  | 'programa'
  | 'privacidad';

export type ReglaParametro = {
  clave: string;
  grupo: GrupoParametro;
  etiqueta: string;
  ayuda: string;
  unidad: string;
  minimo: number;
  maximo: number;
  // Afecta lo que cuestan los premios: exige además una confirmación adicional
  costoPremios?: boolean;
};

export const TEXTO_GRUPO_PARAMETRO: Record<GrupoParametro, string> = {
  busqueda: 'Búsqueda y mapa',
  publicaciones: 'Publicaciones',
  operaciones: 'Operaciones',
  avisos: 'Avisos',
  reportes: 'Reportes',
  colusion: 'Alertas de colusión',
  plan: 'Plan Pro',
  programa: 'Puntos, entregas y premios',
  privacidad: 'Privacidad y retención',
};

export const PARAMETROS_EDITABLES: ReglaParametro[] = [
  {
    clave: 'radio_defecto_km',
    grupo: 'busqueda',
    etiqueta: 'Radio de búsqueda por defecto',
    ayuda: 'No puede superar el radio máximo.',
    unidad: 'km',
    minimo: 1,
    maximo: 20,
  },
  {
    clave: 'radio_maximo_km',
    grupo: 'busqueda',
    etiqueta: 'Radio máximo permitido',
    ayuda: 'No puede ser menor que el radio por defecto.',
    unidad: 'km',
    minimo: 5,
    maximo: 50,
  },
  {
    clave: 'radio_aviso_publicacion_km',
    grupo: 'busqueda',
    etiqueta: 'Distancia para avisar de una publicación nueva',
    ayuda: 'A los negocios cercanos con la alerta activada.',
    unidad: 'km',
    minimo: 1,
    maximo: 50,
  },
  {
    clave: 'dias_precio_al_dia',
    grupo: 'busqueda',
    etiqueta: 'Un precio se considera «al día» hasta',
    ayuda: 'Pasado ese plazo se muestra como antiguo.',
    unidad: 'días',
    minimo: 1,
    maximo: 14,
  },
  {
    clave: 'vigencia_publicacion_dias',
    grupo: 'publicaciones',
    etiqueta: 'Vigencia de una publicación',
    ayuda: 'Se aplica a las publicaciones nuevas.',
    unidad: 'días',
    minimo: 1,
    maximo: 30,
  },
  {
    clave: 'plazo_aviso_entrega_horas',
    grupo: 'operaciones',
    etiqueta: 'Aviso por entrega sin confirmar',
    ayuda: 'Horas en «Entregada» antes de avisar a ambas partes.',
    unidad: 'horas',
    minimo: 24,
    maximo: 168,
  },
  {
    clave: 'plazo_conformidad_horas',
    grupo: 'operaciones',
    etiqueta: 'Cierre automático sin respuesta',
    ayuda: 'Horas en «Confirmada» antes de completarse sola.',
    unidad: 'horas',
    minimo: 48,
    maximo: 168,
  },
  {
    clave: 'aviso_max_activos',
    grupo: 'avisos',
    etiqueta: 'Avisos activos por negocio',
    ayuda: 'Igual para Gratis y Pro.',
    unidad: 'avisos',
    minimo: 1,
    maximo: 10,
  },
  {
    clave: 'aviso_vigencia_max_dias',
    grupo: 'avisos',
    etiqueta: 'Vigencia máxima de un aviso',
    ayuda: 'Igual para Gratis y Pro.',
    unidad: 'días',
    minimo: 1,
    maximo: 30,
  },
  {
    clave: 'reportes_max_abiertos_reciclador',
    grupo: 'reportes',
    etiqueta: 'Reportes abiertos por reciclador',
    ayuda: 'Contra reportes masivos.',
    unidad: 'reportes',
    minimo: 1,
    maximo: 20,
  },
  {
    clave: 'reportes_max_por_negocio_24h',
    grupo: 'reportes',
    etiqueta: 'Reportes sobre un mismo negocio en 24 horas',
    ayuda: 'Contra reportes masivos.',
    unidad: 'reportes',
    minimo: 1,
    maximo: 10,
  },
  {
    clave: 'colusion_operaciones_par_7_dias',
    grupo: 'colusion',
    etiqueta: 'Operaciones del mismo par en 7 días',
    ayuda: 'Solo alerta; nunca bloquea.',
    unidad: 'operaciones',
    minimo: 2,
    maximo: 10,
  },
  {
    clave: 'colusion_desvio_peso_pct',
    grupo: 'colusion',
    etiqueta: 'Kilos recibidos sobre los publicados',
    ayuda: 'Solo alerta; nunca bloquea.',
    unidad: '%',
    minimo: 10,
    maximo: 90,
  },
  {
    clave: 'colusion_kg_operacion',
    grupo: 'colusion',
    etiqueta: 'Kilos en una sola operación',
    ayuda: 'Solo alerta; nunca bloquea.',
    unidad: 'kg',
    minimo: 100,
    maximo: 5000,
  },
  {
    clave: 'recomendado_ventaja_pro_m',
    grupo: 'plan',
    etiqueta: 'Ventaja del plan Pro en «Recomendado»',
    ayuda: 'Solo en ese orden; los demás la ignoran. 0 la anula.',
    unidad: 'm',
    minimo: 0,
    maximo: 2000,
  },
  {
    clave: 'plan_aviso_vence_dias',
    grupo: 'plan',
    etiqueta: 'Aviso de plan Pro por vencer',
    ayuda: 'Días antes de la fecha de fin.',
    unidad: 'días',
    minimo: 1,
    maximo: 30,
  },
  {
    clave: 'premio_aviso_dias',
    grupo: 'programa',
    etiqueta: 'Aviso de premio por vencer',
    ayuda: 'Días antes del fin del plazo de reclamo.',
    unidad: 'días',
    minimo: 1,
    maximo: 15,
  },
  {
    clave: 'premio_stock_bajo',
    grupo: 'programa',
    etiqueta: 'Stock bajo de un premio',
    ayuda: 'Se cuenta en el panel de inicio.',
    unidad: 'unidades',
    minimo: 1,
    maximo: 50,
  },
  {
    clave: 'puntos_por_invitacion',
    grupo: 'programa',
    etiqueta: 'Bono de invitación',
    ayuda: 'Puntos de bono para cada parte; no dan giros.',
    unidad: 'puntos',
    minimo: 0,
    maximo: 100,
  },
  {
    clave: 'registro_directo_max_pendientes',
    grupo: 'programa',
    etiqueta: 'Entregas directas pendientes por reciclador',
    ayuda: 'Máximo a la vez.',
    unidad: 'entregas',
    minimo: 1,
    maximo: 10,
  },
  {
    clave: 'registro_directo_vigencia_dias',
    grupo: 'programa',
    etiqueta: 'Plazo para confirmar una entrega directa',
    ayuda: 'Sin puntos si vence.',
    unidad: 'días',
    minimo: 1,
    maximo: 30,
  },
  {
    clave: 'desafio_reclamo_dias',
    grupo: 'programa',
    etiqueta: 'Plazo para reclamar un desafío',
    ayuda: 'Días tras terminar el mes.',
    unidad: 'días',
    minimo: 1,
    maximo: 15,
  },
  {
    clave: 'ranking_max_filas',
    grupo: 'programa',
    etiqueta: 'Filas visibles del ranking',
    ayuda: 'Más «tu posición».',
    unidad: 'filas',
    minimo: 5,
    maximo: 100,
  },
  {
    clave: 'puntos_por_giro',
    grupo: 'programa',
    etiqueta: 'Puntos de reciclaje por cada giro',
    ayuda: 'Afecta cuántos premios se reparten.',
    unidad: 'puntos',
    minimo: 100,
    maximo: 5000,
    costoPremios: true,
  },
  {
    clave: 'meta_mes_kg',
    grupo: 'programa',
    etiqueta: 'Kilos de la Meta del mes',
    ayuda: 'Rige desde el próximo mes; da 1 giro.',
    unidad: 'kg',
    minimo: 20,
    maximo: 1000,
    costoPremios: true,
  },
  {
    clave: 'tope_diario_registro_directo',
    grupo: 'programa',
    etiqueta: 'Tope diario de puntos por entrega directa',
    ayuda: 'Por reciclador y por día de Lima.',
    unidad: 'puntos',
    minimo: 50,
    maximo: 1000,
    costoPremios: true,
  },
  {
    clave: 'retencion_coordinacion_meses',
    grupo: 'privacidad',
    etiqueta: 'Conservar el punto y el mensaje de una operación cerrada',
    ayuda:
      'Propuesta pendiente de revisión legal. Pasado el plazo se borran el punto, la referencia y el mensaje; la operación se conserva.',
    unidad: 'meses',
    minimo: 6,
    maximo: 60,
  },
];

// Se muestran como fijos: no se editan desde la interfaz
export const PARAMETROS_FIJOS: Array<{ clave: string; etiqueta: string; motivo: string }> = [
  {
    clave: 'precio_kg_minimo',
    etiqueta: 'Precio mínimo por kg',
    motivo: 'El rango de precio es una regla del producto (S/ 0.10 a 50.00).',
  },
  {
    clave: 'precio_kg_maximo',
    etiqueta: 'Precio máximo por kg',
    motivo: 'El rango de precio es una regla del producto (S/ 0.10 a 50.00).',
  },
  { clave: 'puntos_por_kg', etiqueta: 'Puntos por kg reciclado', motivo: 'Es 1 punto por kg: una regla del producto.' },
];

export const REGLAS_FIJAS_PRODUCTO = [
  {
    titulo: 'Semáforo por tercios',
    detalle: 'Compara precios entre quienes lo compran cerca. Siempre con ícono y texto.',
  },
  {
    titulo: 'Niveles por kilos',
    detalle: 'Semilla, Brote, Recolector, Guardián, Maestro y Leyenda salen de los kilos reales.',
  },
  { titulo: 'Administradores no editan precios', detalle: 'Solo marcan, piden corrección o suspenden con motivo.' },
  {
    titulo: 'Verificación obligatoria',
    detalle: 'Centros y compradores móviles aparecen en el mapa solo si están verificados.',
  },
  {
    titulo: 'Tipos de premio',
    detalle: 'Solo puntos de bono, objetos y «Sigue intentando»: nunca dinero, saldo ni canje con terceros.',
  },
];

export const reglaDe = (clave: string) => PARAMETROS_EDITABLES.find((r) => r.clave === clave);
