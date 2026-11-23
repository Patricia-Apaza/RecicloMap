import { ESCALA_AZAR } from '@reciclomap/shared';

export type PremioDeRuleta = {
  id: string;
  nombre: string;
  tipo: 'PUNTOS' | 'OBJETO' | 'SIN_PREMIO';
  probabilidad: number;
  stock: number | null;
  vigenteDesde: Date | null;
  vigenteHasta: Date | null;
  orden: number;
};

export type MotivoSinSalida = 'SIN_STOCK' | 'FUERA_DE_CAMPANA';

// Un premio sin stock o fuera de su campaña no puede salir; "Sigue intentando" siempre puede
export function motivoSinSalida(premio: PremioDeRuleta, ahora: Date): MotivoSinSalida | null {
  if (premio.tipo === 'SIN_PREMIO') return null;
  if (premio.vigenteDesde && ahora < premio.vigenteDesde) return 'FUERA_DE_CAMPANA';
  if (premio.vigenteHasta && ahora >= premio.vigenteHasta) return 'FUERA_DE_CAMPANA';
  if (premio.stock !== null && premio.stock <= 0) return 'SIN_STOCK';
  return null;
}

const centesimas = (porcentaje: number) => Math.round(porcentaje * 100);

export class RuletaMalConfigurada extends Error {}

// Las probabilidades activas deben sumar 100 % y debe existir el segmento sin premio
export function validarRuleta(premios: PremioDeRuleta[]): PremioDeRuleta {
  const total = premios.reduce((suma, p) => suma + centesimas(p.probabilidad), 0);
  const sinPremio = premios.find((p) => p.tipo === 'SIN_PREMIO');
  if (total !== ESCALA_AZAR || !sinPremio)
    throw new RuletaMalConfigurada('La ruleta no suma 100 % o no tiene segmento sin premio');
  return sinPremio;
}

export type ResultadoSorteo = {
  sorteado: PremioDeRuleta;
  entregado: PremioDeRuleta;
  motivo: MotivoSinSalida | null;
};

// El número va de 0 a 9 999; cada premio ocupa un tramo según su probabilidad, en el orden de la ruleta
export function sortear(premios: PremioDeRuleta[], numero: number, ahora: Date): ResultadoSorteo {
  const sinPremio = validarRuleta(premios);
  const ordenados = [...premios].sort((a, b) => a.orden - b.orden);
  let acumulado = 0;
  let sorteado = ordenados[ordenados.length - 1]!;
  for (const premio of ordenados) {
    acumulado += centesimas(premio.probabilidad);
    if (numero < acumulado) {
      sorteado = premio;
      break;
    }
  }
  const motivo = motivoSinSalida(sorteado, ahora);
  return { sorteado, entregado: motivo ? sinPremio : sorteado, motivo };
}

// Lo que se muestra: la probabilidad de un premio que no puede salir pasa al segmento sin premio
export function probabilidadesEfectivas(premios: PremioDeRuleta[], ahora: Date): Map<string, number> {
  const sinPremio = validarRuleta(premios);
  const efectivas = new Map<string, number>();
  let trasladada = 0;
  for (const premio of premios) {
    if (motivoSinSalida(premio, ahora)) {
      efectivas.set(premio.id, 0);
      trasladada += centesimas(premio.probabilidad);
    } else {
      efectivas.set(premio.id, centesimas(premio.probabilidad));
    }
  }
  efectivas.set(sinPremio.id, centesimas(sinPremio.probabilidad) + trasladada);
  return new Map([...efectivas].map(([id, valor]) => [id, valor / 100]));
}
