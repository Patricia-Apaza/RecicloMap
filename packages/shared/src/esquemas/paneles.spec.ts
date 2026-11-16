import { describe, expect, it } from 'vitest';
import { esquemaAviso, esquemaPosicionDia, esquemaRutaDia, motivoAvisoNoPermitido } from './paneles.js';

describe('avisos del negocio', () => {
  it('acepta un aviso informativo', () => {
    expect(motivoAvisoNoPermitido('Jornada de recepción este sábado de 8 a 12')).toBeNull();
    expect(motivoAvisoNoPermitido('Recibimos nuevo material: aluminio limpio, mínimo 20 kg')).toBeNull();
  });

  it.each([
    ['Pagamos S/ 2.80 por kg', 'precios'],
    ['Pagamos S/2,80', 'precios'],
    ['hasta 3 soles el kilo', 'precios'],
    ['PET a 2.50 x kg', 'precios'],
    ['Llámanos al 951 234 567', 'teléfonos'],
    ['WhatsApp 951-234-567', 'teléfonos'],
    ['escribe al +51 951234567', 'teléfonos'],
    ['más info en www.acopio.pe', 'enlaces'],
    ['https://wa.me/51951234567', 'enlaces'],
    ['escribe a acopio@correo.pe', 'enlaces'],
  ])('rechaza "%s" (%s)', (texto, tipo) => {
    expect(motivoAvisoNoPermitido(texto)).toContain(`No incluyas ${tipo === 'enlaces' ? 'enlaces' : tipo}`);
  });

  it('valida longitud y tipo', () => {
    expect(esquemaAviso.safeParse({ tipo: 'ANUNCIO', titulo: 'ab' }).success).toBe(false);
    expect(esquemaAviso.safeParse({ tipo: 'ANUNCIO', titulo: 'x'.repeat(61) }).success).toBe(false);
    expect(
      esquemaAviso.safeParse({ tipo: 'ANUNCIO', titulo: 'Horario especial', mensaje: 'x'.repeat(141) }).success,
    ).toBe(false);
    expect(esquemaAviso.parse({ tipo: 'ANUNCIO', titulo: 'Horario especial' }).vigenciaDias).toBe(7);
  });
});

describe('día del comprador móvil', () => {
  it('la ruta pide horas ordenadas y zonas distintas', () => {
    const parada = { zonaId: 1, desde: '08:00', hasta: '10:00' };
    expect(esquemaRutaDia.safeParse({ publicar: true, paradas: [parada] }).success).toBe(true);
    expect(esquemaRutaDia.safeParse({ publicar: true, paradas: [{ ...parada, hasta: '07:00' }] }).success).toBe(false);
    expect(esquemaRutaDia.safeParse({ publicar: true, paradas: [{ ...parada, zonaId: 999999 }] }).success).toBe(false);
    expect(esquemaRutaDia.safeParse({ publicar: true, paradas: [parada, parada] }).success).toBe(false);
  });

  it('compartir la posición exige la ubicación', () => {
    expect(esquemaPosicionDia.safeParse({ comparte: true }).success).toBe(false);
    expect(esquemaPosicionDia.safeParse({ comparte: true, posicion: { lat: -15.5, lng: -70.1 } }).success).toBe(true);
    expect(esquemaPosicionDia.safeParse({ comparte: false }).success).toBe(true);
  });
});
