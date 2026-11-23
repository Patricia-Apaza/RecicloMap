import { Module } from '@nestjs/common';
import {
  AuditoriaAdminController,
  AvisosAdminController,
  PanelAdminController,
  UsuariosAdminController,
} from './administracion.controller.js';
import { AuditoriaAdminService } from './auditoria-admin.service.js';
import { AvisosAdminService } from './avisos-admin.service.js';
import {
  CiudadesAdminController,
  ParametrosAdminController,
  PremiosAdminController,
} from './configuracion.controller.js';
import { CiudadesAdminService } from './ciudades-admin.service.js';
import { ParametrosAdminService } from './parametros-admin.service.js';
import { PremiosAdminService } from './premios-admin.service.js';
import { EfectosSuspensionService } from './efectos-suspension.service.js';
import { PanelAdminService } from './panel-admin.service.js';
import { UsuariosAdminService } from './usuarios-admin.service.js';

@Module({
  controllers: [
    UsuariosAdminController,
    AvisosAdminController,
    AuditoriaAdminController,
    PanelAdminController,
    ParametrosAdminController,
    CiudadesAdminController,
    PremiosAdminController,
  ],
  providers: [
    UsuariosAdminService,
    AvisosAdminService,
    AuditoriaAdminService,
    PanelAdminService,
    EfectosSuspensionService,
    ParametrosAdminService,
    CiudadesAdminService,
    PremiosAdminService,
  ],
  exports: [EfectosSuspensionService],
})
export class AdministracionModule {}
