// Alfabeto GSM 03.38: con cualquier carácter fuera de él (á, í, ó, ú…) el SMS pasa a UCS-2 y admite 70 caracteres
const GSM_BASICO = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXTENDIDO = new Set('^{}\\[~]|€\f');

export const LIMITE_SMS = { 'GSM-7': 160, 'UCS-2': 70 } as const;

export type MedidaSms = {
  codificacion: keyof typeof LIMITE_SMS;
  unidades: number;
  limite: number;
  cabeEnUno: boolean;
};

export function medirSms(texto: string): MedidaSms {
  let unidades = 0;
  let esGsm = true;
  for (const caracter of texto) {
    if (GSM_BASICO.has(caracter)) unidades += 1;
    else if (GSM_EXTENDIDO.has(caracter)) unidades += 2;
    else {
      esGsm = false;
      break;
    }
  }
  if (!esGsm) unidades = texto.length;
  const codificacion = esGsm ? 'GSM-7' : 'UCS-2';
  const limite = LIMITE_SMS[codificacion];
  return { codificacion, unidades, limite, cabeEnUno: unidades <= limite };
}

// Usa el nombre si el mensaje cabe en un solo SMS; si no, la alternativa genérica
export function ajustarSms(armar: (nombre: string) => string, nombre: string, alternativa: string): string {
  const conNombre = armar(nombre.trim());
  return medirSms(conNombre).cabeEnUno ? conNombre : armar(alternativa);
}
