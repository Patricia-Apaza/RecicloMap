import { type Semaforo, TEXTO_SEMAFORO } from '@reciclomap/shared';

// Solo identificador y rango: el plan no es un dato de entrada, así que no puede alterar el resultado
export type OpcionComparable = { id: string; min: number; max: number };

const centimos = (valor: number) => Math.round(valor * 100);

// RN-01: tercios sobre el punto medio del rango, entre las opciones visibles del mismo material
export function calcularSemaforo(opciones: OpcionComparable[]): Map<string, Semaforo> {
  // Se trabaja en medios céntimos para que el redondeo no cambie un tercio
  const medios = opciones.map((opcion) => ({ id: opcion.id, medio: centimos(opcion.min) + centimos(opcion.max) }));
  const resultado = new Map<string, Semaforo>();
  if (medios.length === 0) return resultado;

  const maximo = Math.max(...medios.map((opcion) => opcion.medio));
  const minimo = Math.min(...medios.map((opcion) => opcion.medio));
  if (medios.length === 1 || maximo === minimo) {
    for (const opcion of medios) resultado.set(opcion.id, 'SIN_COMPARACION');
    return resultado;
  }
  if (medios.length === 2) {
    for (const opcion of medios) resultado.set(opcion.id, opcion.medio === maximo ? 'MEJOR' : 'BAJO');
    return resultado;
  }
  // Se compara multiplicando por 3 para no dividir: medio ≥ máximo − rango/3 ⇔ 3·medio ≥ 3·máximo − rango
  const rango = maximo - minimo;
  for (const opcion of medios) {
    const triple = opcion.medio * 3;
    if (triple >= maximo * 3 - rango) resultado.set(opcion.id, 'MEJOR');
    else if (triple >= minimo * 3 + rango) resultado.set(opcion.id, 'INTERMEDIO');
    else resultado.set(opcion.id, 'BAJO');
  }
  return resultado;
}

export function semaforoConTexto(clave: Semaforo, comparadoEntre: number) {
  return { clave, texto: TEXTO_SEMAFORO[clave].texto, comparadoEntre };
}
