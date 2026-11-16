import { nombreBd } from '../src/nucleo/base-datos/conexiones.js';
import { reiniciarBaseDatos } from './reinicio.js';

const pruebas = process.argv.includes('--pruebas');

reiniciarBaseDatos(pruebas)
  .then(() => console.log(`Base de datos ${nombreBd(pruebas)} reiniciada.`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
