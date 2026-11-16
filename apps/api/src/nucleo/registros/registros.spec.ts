import type { IncomingMessage, ServerResponse } from 'node:http';
import { CAMPOS_OCULTOS, idDeSolicitud } from './registros.js';

function simular(cabeceras: Record<string, string>): { id: string; enviado: string | undefined } {
  let enviado: string | undefined;
  const solicitud = { headers: cabeceras } as unknown as IncomingMessage;
  const respuesta = {
    setHeader: (_nombre: string, valor: string) => {
      enviado = valor;
    },
  } as unknown as ServerResponse;
  return { id: idDeSolicitud(solicitud, respuesta), enviado };
}

describe('registros', () => {
  it('genera un identificador de solicitud y lo devuelve en la respuesta', () => {
    const { id, enviado } = simular({});
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(enviado).toBe(id);
  });

  it('reutiliza un identificador recibido si tiene un formato seguro', () => {
    expect(simular({ 'x-request-id': 'solicitud-12345678' }).id).toBe('solicitud-12345678');
    expect(simular({ 'x-request-id': '<script>' }).id).not.toBe('<script>');
  });

  it('nunca registra credenciales ni la posición del usuario', () => {
    expect(CAMPOS_OCULTOS).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-posicion"]']),
    );
  });
});
