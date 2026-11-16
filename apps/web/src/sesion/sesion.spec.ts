import { describe, expect, it } from 'vitest';
import { fuerzaContrasena, mascaraTelefono } from '@/acceso/campos';
import { formatearHorario } from '@/app/admin/verificaciones/formato';
import {
  datosIniciales,
  errorDePrecios,
  paraApi,
  validarMovil,
  validarPasoCentro,
} from '@/app/registro/_negocio/formulario-negocio';
import type { ResumenUsuario } from './api';
import { decidirAcceso } from './protegida';
import { iniciales, nombreCorto, rutaDelPaso, rutaSegura } from './rutas-sesion';

const usuario = (cambios: Partial<ResumenUsuario>): ResumenUsuario => ({
  id: 'u1',
  nombre: 'Marco Quispe Condori',
  rol: 'RECICLADOR',
  estado: 'ACTIVO',
  siguientePaso: 'LISTO',
  ...cambios,
});

describe('Paso pendiente de cada cuenta', () => {
  it('lleva a la pantalla que falta', () => {
    expect(rutaDelPaso(usuario({ siguientePaso: 'VERIFICAR_TELEFONO' }))).toBe('/verificar-telefono');
    expect(rutaDelPaso(usuario({ siguientePaso: 'ELEGIR_MATERIALES' }))).toBe('/registro/materiales');
    expect(rutaDelPaso(usuario({ rol: 'CENTRO', siguientePaso: 'COMPLETAR_NEGOCIO' }))).toBe('/registro/centro');
    expect(rutaDelPaso(usuario({ rol: 'COMPRADOR_MOVIL', siguientePaso: 'COMPLETAR_NEGOCIO' }))).toBe(
      '/registro/comprador',
    );
    expect(rutaDelPaso(usuario({ rol: 'CENTRO', siguientePaso: 'ESPERAR_VERIFICACION' }))).toBe('/verificacion');
  });

  it('sin pasos pendientes, cada rol va a su inicio', () => {
    expect(rutaDelPaso(usuario({}))).toBe('/mapa');
    expect(rutaDelPaso(usuario({ rol: 'CENTRO' }))).toBe('/negocio');
    expect(rutaDelPaso(usuario({ rol: 'ADMIN' }))).toBe('/admin/verificaciones');
  });

  it('solo vuelve a rutas internas tras iniciar sesión', () => {
    expect(rutaSegura('/mapa')).toBe('/mapa');
    expect(rutaSegura('//otro-sitio.test')).toBeNull();
    expect(rutaSegura('https://otro-sitio.test')).toBeNull();
  });

  it('abrevia el nombre para la barra', () => {
    expect(nombreCorto('Marco Quispe Condori')).toBe('Marco Q.');
    expect(iniciales('Marco Quispe Condori')).toBe('MC');
    expect(iniciales('Eco')).toBe('E');
  });
});

describe('Acceso a cada pantalla', () => {
  const sinSesion = { cargando: false, usuario: null, invitado: false };

  it('espera mientras carga la sesión', () => {
    expect(decidirAcceso({ ...sinSesion, cargando: true }, {}, '/mapa')).toEqual({ tipo: 'esperar' });
  });

  it('sin sesión pide iniciar sesión, salvo al invitado donde se permite', () => {
    expect(decidirAcceso(sinSesion, {}, '/mapa')).toEqual({ tipo: 'ir', ruta: '/ingresar?volver=%2Fmapa' });
    expect(decidirAcceso({ ...sinSesion, invitado: true }, { invitado: true }, '/mapa')).toEqual({ tipo: 'mostrar' });
    expect(decidirAcceso({ ...sinSesion, invitado: true }, {}, '/configuracion').tipo).toBe('ir');
  });

  it('un rol sin permiso va a su propio inicio', () => {
    const estado = { ...sinSesion, usuario: usuario({}) };
    expect(decidirAcceso(estado, { roles: ['ADMIN'] }, '/admin/verificaciones')).toEqual({ tipo: 'ir', ruta: '/mapa' });
  });

  it('con un paso pendiente lleva a completarlo', () => {
    const estado = { ...sinSesion, usuario: usuario({ siguientePaso: 'ELEGIR_MATERIALES' }) };
    expect(decidirAcceso(estado, {}, '/mapa')).toEqual({ tipo: 'ir', ruta: '/registro/materiales' });
    expect(decidirAcceso(estado, { pasos: ['ELEGIR_MATERIALES'] }, '/registro/materiales')).toEqual({
      tipo: 'mostrar',
    });
  });
});

describe('Formularios de acceso', () => {
  it('da formato al teléfono mientras se escribe', () => {
    expect(mascaraTelefono('951234567')).toBe('951 234 567');
    expect(mascaraTelefono('+51 951234567')).toBe('951 234 567');
    expect(mascaraTelefono('9512')).toBe('951 2');
  });

  it('mide la contraseña como el prototipo', () => {
    expect(fuerzaContrasena('')).toBe(0);
    expect(fuerzaContrasena('abcdefgh')).toBe(1);
    expect(fuerzaContrasena('abcdefg1')).toBe(2);
    expect(fuerzaContrasena('Abcdefg1')).toBe(3);
    expect(fuerzaContrasena('Abcdefg1!')).toBe(4);
  });
});

describe('Registro del negocio', () => {
  it('valida cada paso de la 05 con los textos del prototipo', () => {
    const datos = datosIniciales('CENTRO');
    expect(validarPasoCentro(1, datos)).toMatchObject({
      nombreComercial: 'Escribe el nombre del negocio.',
      whatsapp: 'Ingresa 9 dígitos.',
    });
    expect(validarPasoCentro(2, datos)).toEqual({
      zonaId: 'Elige la zona de tu local.',
      ubicacion: 'Coloca el pin de tu local en el mapa.',
    });
    const conPin = { ...datos, zonaId: 1, ubicacion: { lat: -15.4935, lng: -70.1355 } };
    expect(validarPasoCentro(2, conPin)).toEqual({});
    // Sin clave de Google Maps (solo fuera de producción) la zona sirve de respaldo
    expect(validarPasoCentro(2, { ...datos, zonaId: 1 }, false)).toEqual({});
    expect(paraApi('CENTRO', conPin)).toMatchObject({ ubicacion: { lat: -15.4935, lng: -70.1355 } });
    expect(validarPasoCentro(3, { ...datos, dias: [] })).toEqual({ dias: 'Elige al menos un día.' });
    expect(validarPasoCentro(3, { ...datos, abre: '18:00', cierra: '08:00' })).toHaveProperty('cierra');
  });

  it('el error de precio nombra el material', () => {
    const datos = datosIniciales('CENTRO');
    expect(errorDePrecios(datos.precios)).toBe('Marca al menos un material que compras.');
    const conPapel = { ...datos.precios, papel: { activo: true, min: '', max: '0.40', demanda: 'MEDIA' as const } };
    expect(errorDePrecios(conPapel)).toBe('Falta el precio mínimo de Papel.');
    expect(
      errorDePrecios({ ...datos.precios, pet: { activo: true, min: '0,80', max: '1.20', demanda: 'ALTA' as const } }),
    ).toBeNull();
  });

  it('el comprador móvil no envía días ni métodos de pago que la 06 no pide', () => {
    const datos = { ...datosIniciales('MOVIL'), nombreComercial: 'Compras Rubén', whatsapp: '987654321', zonaId: 3 };
    const cuerpo = paraApi('MOVIL', datos) as { horario: Record<string, unknown>; pagos: unknown[] };
    expect(cuerpo.horario).toEqual({ abre: '07:00', cierra: '16:00' });
    expect(cuerpo.pagos).toEqual([]);
    expect(validarMovil(datos)).toEqual({ precios: 'Marca al menos un material que compras.' });
  });
});

describe('Horario en la cola del administrador', () => {
  it('agrupa días seguidos con el mismo horario', () => {
    const horario = (dia: number) => ({ dia, abre: '08:00', cierra: '18:00' });
    expect(formatearHorario([1, 2, 3, 4, 5, 6].map(horario))).toBe('Lun–Sáb 08:00–18:00');
    expect(formatearHorario([1, 2, 3, 4, 5, 6, 7].map(horario))).toBe('Todos los días 08:00–18:00');
    expect(formatearHorario([1, 3].map(horario))).toBe('Lun, Mié 08:00–18:00');
    expect(formatearHorario([])).toBe('No indicado');
  });
});
