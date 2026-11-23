import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import type { SolicitudConUsuario } from '../../nucleo/seguridad/decoradores.js';
import { enMantenimiento } from './modo-mantenimiento.js';
import { OperativoService } from './operativo.service.js';

const LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);
// Aunque usen POST, no cambian nada del producto: entrar, salir, renovar la sesión y bajarse la copia de los propios datos
const PERMITIDAS = [
  /^POST \/api\/v1\/auth\/(login|refresh|logout|logout-todas|google|admin\/verificar)$/,
  /^POST \/api\/v1\/yo\/exportacion(\/codigo)?$/,
];

// Mantenimiento: solo lectura para todos menos la administración
@Injectable()
export class GuardiaMantenimiento implements CanActivate {
  constructor(private readonly operativo: OperativoService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (!enMantenimiento()) return true;
    const solicitud = contexto.switchToHttp().getRequest<Request & SolicitudConUsuario>();
    if (solicitud.usuario?.rol === 'ADMIN' || LECTURA.has(solicitud.method)) return true;
    const ruta = `${solicitud.method} ${solicitud.originalUrl.split('?')[0]}`;
    if (PERMITIDAS.some((p) => p.test(ruta))) return true;
    throw new ErrorNegocio('MANTENIMIENTO', await this.operativo.mensajeMantenimiento(), 503);
  }
}
