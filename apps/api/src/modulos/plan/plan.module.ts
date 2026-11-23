import { Module } from '@nestjs/common';
import { PlanAdminService } from './plan-admin.service.js';
import { MiPlanController, PlanAdminController } from './plan.controller.js';
import { PlanService } from './plan.service.js';

@Module({
  controllers: [MiPlanController, PlanAdminController],
  providers: [PlanService, PlanAdminService],
  exports: [PlanService],
})
export class PlanModule {}
