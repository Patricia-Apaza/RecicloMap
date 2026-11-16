import { Module } from '@nestjs/common';
import { AdminReportesService } from './admin-reportes.service.js';
import { ModeracionService } from './moderacion.service.js';
import { AdminReportesController, NegocioReportesController, ReportesController } from './reportes.controller.js';
import { ReportesTareas } from './reportes-tareas.js';
import { ReportesService } from './reportes.service.js';

@Module({
  controllers: [ReportesController, NegocioReportesController, AdminReportesController],
  providers: [ReportesService, AdminReportesService, ModeracionService, ReportesTareas],
})
export class ReportesModule {}
