import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';

// Único origen del azar de la ruleta; las pruebas lo reemplazan por uno controlado
@Injectable()
export class GeneradorDeAzar {
  entero(maximoExclusivo: number): number {
    return randomInt(maximoExclusivo);
  }
}
