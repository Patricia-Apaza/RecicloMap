import { Global, Module } from '@nestjs/common';
import { ControlesAdminService } from './controles-admin.service.js';
import { GuardiaMantenimiento } from './guardia-mantenimiento.js';
import { ControlesAdminController, EstadoController } from './operativo.controller.js';
import { OperativoService } from './operativo.service.js';

@Global()
@Module({
  controllers: [EstadoController, ControlesAdminController],
  providers: [OperativoService, ControlesAdminService, GuardiaMantenimiento],
  exports: [OperativoService, GuardiaMantenimiento],
})
export class OperativoModule {}
