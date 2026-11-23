import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { configurarAplicacion } from './aplicacion.js';
import { Configuracion } from './nucleo/configuracion/configuracion.js';

function simularApp(entorno: 'development' | 'test' | 'production', exponeDocumentacion = entorno === 'development') {
  const configuracion = {
    entorno,
    esProduccion: entorno === 'production',
    exponeDocumentacion,
    origenesWeb: ['http://localhost:3000'],
  };
  return {
    get: (clase: unknown) => (clase === Configuracion ? configuracion : clase === Logger ? {} : undefined),
    useLogger: () => undefined,
    setGlobalPrefix: () => undefined,
    use: () => undefined,
    enableCors: () => undefined,
    enableShutdownHooks: () => undefined,
  } as never;
}

describe('documentación de la API', () => {
  it('fuera de desarrollo la ruta de Swagger no se monta', () => {
    const crear = vi.spyOn(SwaggerModule, 'createDocument').mockReturnValue({} as never);
    const montar = vi.spyOn(SwaggerModule, 'setup').mockReturnValue(undefined);
    configurarAplicacion(simularApp('production'));
    configurarAplicacion(simularApp('test'));
    expect(montar).not.toHaveBeenCalled();
    configurarAplicacion(simularApp('development'));
    expect(montar).toHaveBeenCalledTimes(1);
    crear.mockRestore();
    montar.mockRestore();
  });
});
