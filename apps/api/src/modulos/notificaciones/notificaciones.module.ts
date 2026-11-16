import { Global, Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesDifusor } from './difusor.js';
import { EnVivoGateway } from './en-vivo.gateway.js';
import { NotificacionesService } from './notificaciones.service.js';

@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, EnVivoGateway, NotificacionesDifusor],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
