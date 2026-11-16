import { Global, Module } from '@nestjs/common';
import { Configuracion } from './configuracion.js';

@Global()
@Module({
  providers: [{ provide: Configuracion, useFactory: () => new Configuracion() }],
  exports: [Configuracion],
})
export class ConfiguracionModule {}
