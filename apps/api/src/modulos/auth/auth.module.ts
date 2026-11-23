import { Module } from '@nestjs/common';
import { JuegoModule } from '../juego/juego.module.js';
import { MensajeriaModule } from '../mensajeria/mensajeria.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Codigos } from './codigos.js';
import { VerificadorGoogle, VerificadorGoogleOficial } from './google.js';

@Module({
  imports: [MensajeriaModule, JuegoModule],
  controllers: [AuthController],
  providers: [AuthService, Codigos, { provide: VerificadorGoogle, useClass: VerificadorGoogleOficial }],
  exports: [Codigos],
})
export class AuthModule {}
