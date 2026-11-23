import { describe, expect, it } from 'vitest';
import { esquemaCodigo, esquemaContrasena, esquemaRegistroReciclador, esquemaTelefono } from './acceso.js';
import { esquemaHorario, esquemaPrecios, esquemaRechazo, esquemaRegistroNegocioCompleto } from './negocio.js';

const mensajes = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues.map((problema) => problema.message) ?? [];

describe('Esquemas de acceso', () => {
  it('normaliza el teléfono y solo acepta 9 dígitos que empiezan con 9', () => {
    expect(esquemaTelefono.parse('+51 951 234 567')).toBe('951234567');
    expect(esquemaTelefono.safeParse('851234567').success).toBe(false);
  });

  it('la contraseña tiene al menos 8 caracteres', () => {
    expect(mensajes(esquemaContrasena.safeParse('1234567'))).toEqual([
      'La contraseña debe tener al menos 8 caracteres.',
    ]);
    expect(esquemaContrasena.safeParse('12345678').success).toBe(true);
  });

  it('el código tiene exactamente 6 dígitos', () => {
    expect(esquemaCodigo.safeParse('123456').success).toBe(true);
    expect(esquemaCodigo.safeParse('12345').success).toBe(false);
    expect(esquemaCodigo.safeParse('12345a').success).toBe(false);
  });

  it('el reciclador escribe nombre y apellido y acepta los términos', () => {
    const base = {
      nombre: 'Rosa Mamani',
      telefono: '951234567',
      contrasena: 'Prueba2026',
      aceptaTerminos: true,
      mayorDeEdad: true,
    };
    expect(esquemaRegistroReciclador.safeParse(base).success).toBe(true);
    expect(esquemaRegistroReciclador.safeParse({ ...base, nombre: 'Rosa' }).success).toBe(false);
    expect(esquemaRegistroReciclador.safeParse({ ...base, aceptaTerminos: false }).success).toBe(false);
    expect(esquemaRegistroReciclador.parse({ ...base, correo: '' }).correo).toBeUndefined();
  });
});

describe('Esquemas de negocio', () => {
  it('el error de precio nombra el material', () => {
    expect(mensajes(esquemaPrecios.safeParse({ plastico: { max: 1 } }))).toContain(
      'Falta el precio mínimo de Plástico duro.',
    );
  });

  it('el precio va de S/ 0.10 a S/ 50.00, con dos decimales y máximo ≥ mínimo', () => {
    expect(esquemaPrecios.safeParse({ pet: { min: 0.1, max: 50 } }).success).toBe(true);
    expect(mensajes(esquemaPrecios.safeParse({ pet: { min: 0.09, max: 1 } }))).toContain(
      'El precio de PET debe estar entre S/ 0.10 y S/ 50.00 por kg.',
    );
    expect(mensajes(esquemaPrecios.safeParse({ pet: { min: 50.01, max: 51 } }))).toContain(
      'El precio de PET debe estar entre S/ 0.10 y S/ 50.00 por kg.',
    );
    expect(mensajes(esquemaPrecios.safeParse({ metal: { min: 1.255, max: 2 } }))).toContain(
      'Usa como máximo dos decimales en el precio de Metales.',
    );
    expect(mensajes(esquemaPrecios.safeParse({ papel: { min: 1, max: 0.5 } }))).toContain(
      'En Papel, el precio máximo no puede ser menor que el mínimo.',
    );
  });

  it('la demanda se guarda aparte del precio y es Media si no se indica', () => {
    expect(esquemaPrecios.parse({ carton: { min: 0.3, max: 0.5 } }).carton).toEqual({
      min: 0.3,
      max: 0.5,
      demanda: 'MEDIA',
    });
  });

  it('exige al menos un material', () => {
    expect(mensajes(esquemaPrecios.safeParse({}))).toContain('Marca al menos un material que compras.');
  });

  it('el horario cierra después de abrir', () => {
    expect(esquemaHorario.safeParse({ dias: [1], abre: '18:00', cierra: '08:00' }).success).toBe(false);
  });

  it('el centro necesita dirección y el comprador móvil, vehículo', () => {
    const comun = {
      nombreComercial: 'EcoAcopio',
      whatsapp: '987654321',
      horario: { dias: [1], abre: '08:00', cierra: '18:00' },
      precios: { pet: { min: 0.8, max: 1.2 } },
      pagos: ['EFECTIVO'],
      zonaId: 1,
    };
    expect(esquemaRegistroNegocioCompleto.safeParse({ ...comun, tipo: 'CENTRO' }).success).toBe(false);
    const sinPin = esquemaRegistroNegocioCompleto.safeParse({
      ...comun,
      tipo: 'CENTRO',
      direccion: 'Jr. Moquegua 123',
    });
    // Sin mapa disponible el pin puede faltar; la API decide si lo exige
    expect(sinPin.success).toBe(true);
    const pinMalo = esquemaRegistroNegocioCompleto.safeParse({
      ...comun,
      tipo: 'CENTRO',
      direccion: 'Jr. Moquegua 123',
      ubicacion: { lat: 120, lng: -70.13 },
    });
    expect(pinMalo.success).toBe(false);
    const conPin = { ...comun, tipo: 'CENTRO', direccion: 'Jr. Moquegua 123', ubicacion: { lat: -15.49, lng: -70.13 } };
    expect(esquemaRegistroNegocioCompleto.safeParse(conPin).success).toBe(true);
    expect(esquemaRegistroNegocioCompleto.safeParse({ ...comun, tipo: 'MOVIL' }).success).toBe(false);
    expect(esquemaRegistroNegocioCompleto.safeParse({ ...comun, tipo: 'MOVIL', vehiculo: 'MOTO' }).success).toBe(true);
  });

  it('rechazar exige un motivo de la lista y un mensaje', () => {
    expect(esquemaRechazo.safeParse({ motivo: 'Negocio duplicado', mensaje: 'Ya existe en el mapa.' }).success).toBe(
      true,
    );
    expect(esquemaRechazo.safeParse({ motivo: 'Me cae mal', mensaje: 'Ya existe en el mapa.' }).success).toBe(false);
    expect(esquemaRechazo.safeParse({ motivo: 'Negocio duplicado', mensaje: '' }).success).toBe(false);
  });
});

describe('Filtros del mapa', () => {
  it('exige material y solo admite los radios 1, 3, 5, 10 y 20 km', async () => {
    const { esquemaFiltrosMapa } = await import('./mapa.js');
    expect(esquemaFiltrosMapa.parse({ material: 'pet' })).toMatchObject({
      radio: 5,
      tipo: 'todos',
      orden: 'recomendado',
      pagos: [],
    });
    expect(
      esquemaFiltrosMapa.parse({ material: 'pet', radio: '10', pagos: 'EFECTIVO,YAPE', soloAbiertos: 'true' }),
    ).toMatchObject({
      radio: 10,
      pagos: ['EFECTIVO', 'YAPE'],
      soloAbiertos: true,
    });
    expect(esquemaFiltrosMapa.safeParse({ material: 'pet', radio: 7 }).success).toBe(false);
    expect(esquemaFiltrosMapa.safeParse({}).success).toBe(false);
  });

  it('la posición se redondea a unos 100 m', async () => {
    const { esquemaPosicion, redondearPosicion } = await import('./mapa.js');
    expect(esquemaPosicion.parse('-15.49712,-70.13284')).toEqual({ lat: -15.497, lng: -70.133 });
    expect(redondearPosicion(-15.49712, -70.13284)).toBe('-15.497,-70.133');
    expect(esquemaPosicion.safeParse('Juliaca').success).toBe(false);
  });
});
