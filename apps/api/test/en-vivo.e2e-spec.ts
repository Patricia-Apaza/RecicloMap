import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { NotificacionesDifusor } from '../src/modulos/notificaciones/difusor.js';
import { NotificacionesService } from '../src/modulos/notificaciones/notificaciones.service.js';
import { crearPrueba, nuevoReciclador, type Prueba } from './apoyo.js';

describe('Notificaciones en vivo (ADR-0007)', () => {
  let prueba: Prueba;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    prueba = await crearPrueba();
    await prueba.app.listen(0);
    const servidor = prueba.app.getHttpServer() as unknown as { address(): AddressInfo };
    url = `http://localhost:${servidor.address().port}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await prueba.cerrar();
  });

  const conectar = (token?: string) => {
    const socket = io(url, {
      path: '/api/v1/en-vivo',
      auth: token ? { token } : {},
      transports: ['websocket'],
      extraHeaders: { origin: 'http://localhost:3000' },
    });
    sockets.push(socket);
    return socket;
  };

  it('quien se conecta con su sesión recibe solo sus avisos ya confirmados', async () => {
    const token = await nuevoReciclador(prueba, '948000001', 'Ana Quispe');
    const otro = await nuevoReciclador(prueba, '948000002', 'Luis Mamani');
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '948000001' } });

    const propio = conectar(token);
    const ajeno = conectar(otro);
    await Promise.all([propio, ajeno].map((s) => new Promise<void>((listo) => s.on('connect', () => listo()))));
    // Se da un momento para que el servidor una cada conexión a su sala
    await new Promise((listo) => setTimeout(listo, 200));

    const recibidos: string[] = [];
    const ajenos: string[] = [];
    propio.on('notificacion', (aviso: { titulo: string }) => recibidos.push(aviso.titulo));
    ajeno.on('notificacion', (aviso: { titulo: string }) => ajenos.push(aviso.titulo));

    await prueba.app.get(NotificacionesService).crear(prueba.bd, {
      usuarioId: usuario.id,
      tipo: 'OFERTA',
      titulo: 'Nueva oferta por tu PET',
      mensaje: 'Prueba en vivo',
    });
    await prueba.app.get(NotificacionesDifusor).difundir();
    await new Promise((listo) => setTimeout(listo, 300));
    expect(recibidos).toContain('Nueva oferta por tu PET');
    expect(ajenos).not.toContain('Nueva oferta por tu PET');

    // Difundir de nuevo no repite el aviso
    await prueba.app.get(NotificacionesDifusor).difundir();
    await new Promise((listo) => setTimeout(listo, 200));
    expect(recibidos.filter((t) => t === 'Nueva oferta por tu PET')).toHaveLength(1);
  });

  it('sin sesión válida la conexión se cierra', async () => {
    const socket = conectar('token-falso');
    const cerrada = await new Promise<boolean>((listo) => {
      socket.on('disconnect', () => listo(true));
      setTimeout(() => listo(false), 3000);
    });
    expect(cerrada).toBe(true);
  });
});
