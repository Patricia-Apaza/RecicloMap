import { afterEach, describe, expect, it } from 'vitest';
import { ErrorApi } from '@/sesion/api';
import { borrarPendiente, guardarPendiente, leerPendiente, sinConexion } from './pendiente';

describe('Publicación guardada sin señal (12)', () => {
  afterEach(() => localStorage.clear());

  it('se guarda en el celular sin fotos ni ubicación y se puede descartar', () => {
    expect(guardarPendiente({ material: 'papel', kg: 8, precioEsperado: null, nota: null })).toBe(true);
    const guardada = leerPendiente();
    expect(guardada).toMatchObject({ material: 'papel', kg: 8 });
    expect(Object.keys(guardada ?? {})).not.toContain('fotos');
    expect(JSON.stringify(guardada)).not.toMatch(/posicion|zona|lat|lng/i);
    borrarPendiente();
    expect(leerPendiente()).toBeNull();
  });

  it('reconoce la falta de conexión', () => {
    expect(sinConexion(new ErrorApi('SIN_CONEXION', 'Sin conexión', 0))).toBe(true);
    expect(sinConexion(new ErrorApi('ENTRADA_NO_VALIDA', 'Datos', 400))).toBe(false);
  });
});
