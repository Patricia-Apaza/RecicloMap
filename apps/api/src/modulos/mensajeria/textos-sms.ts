import { ajustarSms } from '@reciclomap/shared';
import type { PropositoCodigo } from '../../generado/prisma/enums.js';

// Cada texto debe caber en un solo SMS contando las tildes (70 caracteres si hay á, í, ó o ú)
export const SMS_CODIGO: Record<PropositoCodigo, (codigo: string) => string> = {
  VERIFICAR_TELEFONO: (codigo) => `RecicloMap: tu código de verificación es ${codigo}. Vence en 10 minutos.`,
  RECUPERAR_CONTRASENA: (codigo) => `RecicloMap: tu código para recuperar tu contraseña es ${codigo}.`,
  CAMBIAR_TELEFONO: (codigo) => `RecicloMap: tu código para cambiar de teléfono es ${codigo}.`,
  INICIO_ADMIN: (codigo) => `RecicloMap: tu código de acceso de administración es ${codigo}.`,
};

export type DecisionSms = 'APROBADO' | 'RECHAZADO' | 'INFO_PEDIDA';

const PLANTILLA: Record<DecisionSms, (negocio: string) => string> = {
  APROBADO: (negocio) => `RecicloMap: ${negocio} ya está verificado y aparece en el mapa.`,
  RECHAZADO: (negocio) => `RecicloMap: necesitamos corregir un dato de ${negocio}. Revisa el detalle en la app.`,
  INFO_PEDIDA: (negocio) => `RecicloMap: necesitamos más información de ${negocio}. Revisa la app.`,
};

// Si el nombre del negocio no cabe, el mensaje dice "tu negocio"
export function smsDeDecision(decision: DecisionSms, negocio: string): string {
  return ajustarSms(PLANTILLA[decision], negocio, 'tu negocio');
}
