import { Global, Module } from '@nestjs/common';
import { GuardiaAcceso } from './guardia-acceso.js';
import { Sesiones } from './sesiones.js';
import { Tokens } from './tokens.js';

@Global()
@Module({
  providers: [Tokens, Sesiones, GuardiaAcceso],
  exports: [Tokens, Sesiones, GuardiaAcceso],
})
export class SeguridadModule {}
