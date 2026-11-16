import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { GuardiaAcceso } from '../../nucleo/seguridad/guardia-acceso.js';

export type AvisoEnVivo = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  creadaEn: string;
};

// Avisos con la app abierta (ADR-0007). La tabla de notificaciones es la fuente de verdad: al reconectar se vuelve a pedir
@WebSocketGateway({ path: '/api/v1/en-vivo', cors: { origin: true, credentials: true } })
export class EnVivoGateway implements OnGatewayConnection {
  private readonly registro = new Logger('EnVivo');
  @WebSocketServer() servidor!: Server;

  constructor(
    private readonly guardia: GuardiaAcceso,
    private readonly configuracion: Configuracion,
  ) {}

  async handleConnection(cliente: Socket): Promise<void> {
    const origen = cliente.handshake.headers.origin;
    const token = (cliente.handshake.auth as { token?: unknown }).token;
    if ((origen && !this.configuracion.origenesWeb.includes(origen)) || typeof token !== 'string') {
      cliente.disconnect(true);
      return;
    }
    try {
      const usuario = await this.guardia.cargarUsuario(token);
      await cliente.join(`usuario:${usuario.id}`);
    } catch {
      cliente.disconnect(true);
    }
  }

  emitir(usuarioId: string, aviso: AvisoEnVivo): void {
    try {
      this.servidor.to(`usuario:${usuarioId}`).emit('notificacion', aviso);
    } catch (error) {
      this.registro.warn(`No se pudo emitir en vivo: ${(error as Error).message}`);
    }
  }
}
