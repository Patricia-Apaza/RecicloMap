import { type Semaforo, TEXTO_SEMAFORO } from '@reciclomap/shared';
import s from './mapa.module.css';
import type { Opcion } from './resultados';

const CLASE_SEMAFORO: Record<Semaforo, string> = {
  MEJOR: 'best',
  INTERMEDIO: 'mid',
  BAJO: 'low',
  SIN_COMPARACION: 'none',
};

// Marcador del prototipo: precio y semáforo con texto, además del color
export function contenidoPin(opcion: Opcion, elegido: boolean): HTMLElement {
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = [s.pin, opcion.tipo === 'MOVIL' ? s.pinMovil : '', elegido ? s.pinElegido : ''].join(' ');
  const medio = (Number(opcion.precio.min) + Number(opcion.precio.max)) / 2;
  pin.setAttribute('aria-label', `${opcion.nombre}, S/ ${medio.toFixed(2)} por kilo, ${opcion.semaforo.texto}`);
  const etiqueta = document.createElement('span');
  etiqueta.className = s.pinEtiqueta ?? '';
  const precio = document.createElement('b');
  precio.textContent = `S/ ${medio.toFixed(2)}`;
  const semaforo = document.createElement('span');
  semaforo.className = `tag ${CLASE_SEMAFORO[opcion.semaforo.clave]}`;
  semaforo.textContent = TEXTO_SEMAFORO[opcion.semaforo.clave].corto;
  etiqueta.append(precio, semaforo);
  const punto = document.createElement('span');
  punto.className = s.pinPunto ?? '';
  pin.append(etiqueta, punto);
  return pin;
}

export function contenidoYo(): HTMLElement {
  const yo = document.createElement('div');
  yo.className = s.yo ?? '';
  const texto = document.createElement('span');
  texto.textContent = 'Tú · ubicación aproximada';
  yo.append(texto, document.createElement('i'));
  return yo;
}
