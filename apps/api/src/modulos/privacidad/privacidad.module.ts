import { Module } from '@nestjs/common';
import { AdministracionModule } from '../administracion/administracion.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConsentimientosService } from './consentimientos.service.js';
import { EliminacionService } from './eliminacion.service.js';
import { ExportacionService } from './exportacion.service.js';
import { PrivacidadController } from './privacidad.controller.js';
import { Reautenticacion } from './reautenticacion.js';
import { RetencionService } from './retencion.service.js';

@Module({
  imports: [AuthModule, AdministracionModule],
  controllers: [PrivacidadController],
  providers: [Reautenticacion, ExportacionService, EliminacionService, ConsentimientosService, RetencionService],
})
export class PrivacidadModule {}
