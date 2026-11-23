import type { IncomingMessage, ServerResponse } from 'node:http';
import { CAMPOS_OCULTOS, idDeSolicitud, ocultarConsulta, opcionesDeRegistro } from './registros.js';
import type { Configuracion } from '../configuracion/configuracion.js';

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

  it('el registro de una solicitud no lleva cabeceras, parámetros de la URL ni teléfonos', () => {
    const opciones = opcionesDeRegistro({ nivelLog: 'info', entorno: 'test' } as unknown as Configuracion);
    const serializar = (opciones.pinoHttp as { serializers: { req: (r: unknown) => Record<string, unknown> } })
      .serializers.req;
    const salida = serializar({
      id: 'abc',
      method: 'GET',
      url: '/api/v1/auth/recuperar/951234567?telefono=951234567&posicion=-15.497,-70.133',
      remoteAddress: '10.0.0.1',
      headers: {
        authorization: 'Bearer secreto',
        cookie: 'rm_refresco=secreto',
        'x-posicion': '-15.497,-70.133',
        'user-agent': 'Mozilla',
      },
    });
    const texto = JSON.stringify(salida);
    for (const prohibido of ['secreto', '951234567', '-15.497', 'Mozilla', 'telefono='])
      expect(texto).not.toContain(prohibido);
    expect(salida.url).toBe('/api/v1/auth/recuperar/[teléfono]');
    expect(ocultarConsulta(undefined)).toBeUndefined();
  });
});
