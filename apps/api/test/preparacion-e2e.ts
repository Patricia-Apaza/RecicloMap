import { reiniciarBaseDatos } from '../scripts/reinicio.js';

export default async function prepararPruebasE2e(): Promise<void> {
  process.env.RM_BD_OBJETIVO = 'pruebas';
  await reiniciarBaseDatos(true);
}
