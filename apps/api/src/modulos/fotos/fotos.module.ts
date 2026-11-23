import { Global, Module } from '@nestjs/common';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { Almacen, AlmacenMemoria, AlmacenS3 } from './almacen.js';
import { FotosController } from './fotos.controller.js';
import { FotosService } from './fotos.service.js';

@Global()
@Module({
  controllers: [FotosController],
  providers: [
    FotosService,
    {
      provide: Almacen,
      inject: [Configuracion],
      useFactory: (configuracion: Configuracion) =>
        configuracion.almacen.proveedor === 'memoria' ? new AlmacenMemoria() : new AlmacenS3(configuracion),
    },
  ],
  exports: [FotosService, Almacen],
})
export class FotosModule {}
