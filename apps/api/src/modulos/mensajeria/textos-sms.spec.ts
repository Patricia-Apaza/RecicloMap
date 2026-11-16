import { medirSms } from '@reciclomap/shared';
import { type DecisionSms, SMS_CODIGO, smsDeDecision } from './textos-sms.js';

const NOMBRES = [
  'Eco',
  'Acopio Los Pinos',
  'Recojo Ñuñoa',
  'Compras Rubén',
  'Acopio Ilave Móvil del Altiplano Sur',
  'x'.repeat(120),
];

describe('Textos de SMS', () => {
  it.each(Object.entries(SMS_CODIGO))('el código de %s cabe en un solo SMS', (_proposito, armar) => {
    expect(medirSms(armar('123456')).cabeEnUno).toBe(true);
  });

  it.each(['APROBADO', 'RECHAZADO', 'INFO_PEDIDA'] as DecisionSms[])(
    'el aviso %s cabe con cualquier nombre',
    (decision) => {
      for (const nombre of NOMBRES) {
        expect(medirSms(smsDeDecision(decision, nombre)).cabeEnUno).toBe(true);
      }
    },
  );

  it('usa el nombre del negocio cuando cabe', () => {
    expect(smsDeDecision('APROBADO', 'Eco')).toBe('RecicloMap: Eco ya está verificado y aparece en el mapa.');
    expect(smsDeDecision('APROBADO', 'x'.repeat(120))).toContain('tu negocio');
  });
});
