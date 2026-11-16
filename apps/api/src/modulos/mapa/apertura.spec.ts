import { ahoraEnLima, aperturaCentro, aperturaMovil } from './apertura.js';

// Lunes 16/11/2026, 10:42 en Lima (UTC−5)
const lunes1042 = new Date('2026-11-16T15:42:00.000Z');
const horario = [1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abre: '08:00', cierra: '18:00' }));

describe('Abierto o cerrado', () => {
  it('usa la hora de Lima', () => {
    expect(ahoraEnLima(lunes1042)).toEqual({ dia: 1, hora: '10:42' });
    expect(ahoraEnLima(new Date('2026-11-16T04:00:00.000Z'))).toEqual({ dia: 7, hora: '23:00' });
  });

  it('el centro abre según su horario de hoy', () => {
    expect(aperturaCentro(horario, lunes1042)).toEqual({ abierto: true, texto: 'Abierto hasta 18:00', tono: 'open' });
    expect(aperturaCentro(horario, new Date('2026-11-16T12:30:00.000Z'))).toMatchObject({
      abierto: false,
      texto: 'Cerrado · abre 08:00',
    });
    expect(aperturaCentro(horario, new Date('2026-11-16T23:30:00.000Z'))).toMatchObject({
      abierto: false,
      texto: 'Cerrado',
    });
    expect(aperturaCentro(horario, new Date('2026-11-15T15:00:00.000Z'))).toMatchObject({ abierto: false });
  });

  it('sin horario declarado no inventa un estado', () => {
    expect(aperturaCentro([], lunes1042)).toEqual({ abierto: null, texto: 'Horario no indicado', tono: 'grey' });
  });

  it('el comprador móvil usa su disponibilidad', () => {
    expect(aperturaMovil('DISPONIBLE')).toMatchObject({ abierto: true, texto: 'Disponible' });
    expect(aperturaMovil('EN_RUTA')).toMatchObject({ abierto: true, texto: 'En ruta' });
    expect(aperturaMovil('FUERA_DE_SERVICIO')).toMatchObject({ abierto: false, texto: 'Fuera de servicio' });
  });
});
