import { describe, expect, it } from 'vitest';
import { fechaEnLima, formatearFecha, formatearFechaHora, formatearHace, formatearHora } from './fechas.js';
import { formatearMonto, formatearPrecioPorKg, formatearRangoPrecio, formatearSoles } from './moneda.js';
import { formatearKg } from './peso.js';
import { ajustarSms, medirSms } from './sms.js';
import { enlaceWhatsApp, esTelefonoValido, formatearTelefono, normalizarTelefono } from './telefono.js';

const sinEspacioFijo = (texto: string): string => texto.replaceAll(' ', ' ');

describe('moneda', () => {
  it('muestra soles con "S/ " y dos decimales', () => {
    expect(sinEspacioFijo(formatearSoles(2.5))).toBe('S/ 2.50');
    expect(sinEspacioFijo(formatearSoles('87.5'))).toBe('S/ 87.50');
    expect(sinEspacioFijo(formatearSoles(0))).toBe('S/ 0.00');
  });

  it('separa los miles con coma', () => {
    expect(sinEspacioFijo(formatearSoles(1234.5))).toBe('S/ 1,234.50');
    expect(formatearMonto(15610)).toBe('15,610.00');
  });

  it('une "S/" y la cifra con un espacio que no se parte', () => {
    expect(formatearSoles(2.5)).toBe('S/ 2.50');
  });

  it('muestra el rango de precio como en el prototipo', () => {
    expect(sinEspacioFijo(formatearRangoPrecio(2.5, 2.8))).toBe('S/ 2.50–2.80');
    expect(sinEspacioFijo(formatearPrecioPorKg('2.7'))).toBe('S/ 2.70 por kg');
  });

  it('rechaza un monto que no es número', () => {
    expect(() => formatearSoles('abc')).toThrow(RangeError);
  });
});

describe('peso', () => {
  it('muestra kilos sin decimales innecesarios', () => {
    expect(sinEspacioFijo(formatearKg(35))).toBe('35 kg');
    expect(sinEspacioFijo(formatearKg('35.50'))).toBe('35.5 kg');
    expect(sinEspacioFijo(formatearKg(1240))).toBe('1,240 kg');
  });
});

describe('fechas en America/Lima', () => {
  const medianocheUtc = '2026-10-12T03:30:00Z';

  it('usa el día de Lima, no el de UTC', () => {
    expect(fechaEnLima(medianocheUtc)).toBe('2026-10-11');
    expect(formatearFecha(medianocheUtc)).toBe('11 oct 2026');
  });

  it('muestra la hora de Lima en 24 horas', () => {
    expect(formatearHora('2026-10-12T14:12:00Z')).toBe('09:12');
    expect(formatearFechaHora('2026-10-12T14:12:00Z')).toBe('12 oct 2026 · 09:12');
  });

  it('describe el tiempo transcurrido', () => {
    const ahora = '2026-10-12T20:00:00Z';
    expect(formatearHace('2026-10-12T19:59:40Z', ahora)).toBe('ahora');
    expect(formatearHace('2026-10-12T19:48:00Z', ahora)).toBe('hace 12 min');
    expect(formatearHace('2026-10-12T17:00:00Z', ahora)).toBe('hace 3 h');
    expect(formatearHace('2026-10-11T20:00:00Z', ahora)).toBe('ayer');
    expect(formatearHace('2026-10-09T20:00:00Z', ahora)).toBe('hace 3 días');
    expect(formatearHace('2026-10-05T20:00:00Z', ahora)).toBe('hace 1 semana');
    expect(formatearHace('2026-09-01T20:00:00Z', ahora)).toBe('hace 1 mes');
  });

  it('rechaza una fecha no válida', () => {
    expect(() => formatearFecha('no es fecha')).toThrow(RangeError);
  });
});

describe('teléfono', () => {
  it('acepta celulares peruanos de 9 dígitos', () => {
    expect(esTelefonoValido('951 234 567')).toBe(true);
    expect(esTelefonoValido('+51 951234567')).toBe(true);
    expect(esTelefonoValido('851234567')).toBe(false);
    expect(esTelefonoValido('95123456')).toBe(false);
  });

  it('lo muestra en grupos de tres', () => {
    expect(formatearTelefono('951234567')).toBe('951 234 567');
    expect(normalizarTelefono('+51 951-234-567')).toBe('951234567');
  });

  it('arma el enlace de WhatsApp con el código de Perú', () => {
    expect(enlaceWhatsApp('951 234 567')).toBe('https://wa.me/51951234567');
    expect(enlaceWhatsApp('951234567', 'Hola, coordinemos')).toBe(
      'https://wa.me/51951234567?text=Hola%2C%20coordinemos',
    );
  });
});

describe('Medida de SMS', () => {
  it('usa 160 caracteres si todo está en el alfabeto GSM, incluidas é y ñ', () => {
    expect(medirSms('RecicloMap: tu clave es 123456. Señor, café.')).toMatchObject({
      codificacion: 'GSM-7',
      limite: 160,
    });
  });

  it('con á, í, ó o ú pasa a UCS-2 y el límite baja a 70', () => {
    expect(medirSms('Tu negocio ya está verificado')).toMatchObject({ codificacion: 'UCS-2', limite: 70 });
    expect(medirSms('x'.repeat(70) + 'á').cabeEnUno).toBe(false);
  });

  it('los caracteres extendidos cuentan doble', () => {
    expect(medirSms('€'.repeat(80)).unidades).toBe(160);
    expect(medirSms('€'.repeat(81)).cabeEnUno).toBe(false);
  });

  it('usa el nombre si cabe en un solo SMS y si no, la alternativa', () => {
    const armar = (nombre: string) => `RecicloMap: ${nombre} ya está verificado y aparece en el mapa.`;
    expect(ajustarSms(armar, 'Acopio Sur', 'tu negocio')).toBe(
      'RecicloMap: Acopio Sur ya está verificado y aparece en el mapa.',
    );
    expect(ajustarSms(armar, 'Acopio Los Pinos de Juliaca', 'tu negocio')).toBe(
      'RecicloMap: tu negocio ya está verificado y aparece en el mapa.',
    );
  });
});
