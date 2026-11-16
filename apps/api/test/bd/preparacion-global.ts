import { reiniciarBaseDatos } from '../../scripts/reinicio.js';

// Cada ejecución parte de la base de pruebas recién migrada y sembrada
export default async function prepararPruebas(): Promise<void> {
  process.env.RM_BD_OBJETIVO = 'pruebas';
  await reiniciarBaseDatos(true);
}
