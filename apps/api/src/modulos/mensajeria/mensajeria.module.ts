import { Global, Module } from '@nestjs/common';
import { Mensajeria } from './mensajeria.js';

@Global()
@Module({
  providers: [Mensajeria],
  exports: [Mensajeria],
})
export class MensajeriaModule {}
