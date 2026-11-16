import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { sendNotification, setVapidDetails } from 'web-push';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { EnVivoGateway } from './en-vivo.gateway.js';

const INTERVALO_MS = 2000;
// Margen para notificaciones creadas en una transacción que confirmó un poco después
const SOLAPE_MS = 10_000;
const ANTIGUEDAD_PUSH = '10 minutes';

type Fila = {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  enlace: string | null;
  creada_en: Date;
};

// Bandeja de salida: cada instancia lee lo ya confirmado y lo emite a sus conexiones; el push se envía una sola vez
@Injectable()
export class NotificacionesDifusor implements OnModuleInit, OnModuleDestroy {
  private readonly registro = new Logger('Notificaciones');
  private temporizador: NodeJS.Timeout | null = null;
  private cursor = new Date();
  private readonly emitidas = new Map<string, number>();
  private corriendo = false;

  constructor(
    private readonly prisma: PrismaApi,
    private readonly configuracion: Configuracion,
    private readonly enVivo: EnVivoGateway,
  ) {}

  onModuleInit(): void {
    if (this.configuracion.push) {
      setVapidDetails(
        this.configuracion.push.contacto,
        this.configuracion.push.clavePublica,
        this.configuracion.push.clavePrivada,
      );
    }
    this.temporizador = setInterval(() => void this.difundir(), INTERVALO_MS);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  async difundir(): Promise<number> {
    if (this.corriendo) return 0;
    this.corriendo = true;
    try {
      const desde = new Date(this.cursor.getTime() - SOLAPE_MS);
      const filas = await this.prisma.$queryRaw<Fila[]>`
        SELECT id, usuario_id, tipo::text AS tipo, titulo, mensaje, enlace, creada_en
          FROM notificacion WHERE creada_en > ${desde} ORDER BY creada_en LIMIT 500`;
      const ahora = Date.now();
      let nuevas = 0;
      for (const fila of filas) {
        if (fila.creada_en > this.cursor) this.cursor = fila.creada_en;
        if (this.emitidas.has(fila.id)) continue;
        this.emitidas.set(fila.id, ahora);
        nuevas++;
        this.enVivo.emitir(fila.usuario_id, {
          id: fila.id,
          tipo: fila.tipo,
          titulo: fila.titulo,
          mensaje: fila.mensaje,
          enlace: fila.enlace,
          creadaEn: fila.creada_en.toISOString(),
        });
      }
      for (const [id, momento] of this.emitidas) if (ahora - momento > SOLAPE_MS * 6) this.emitidas.delete(id);
      if (this.configuracion.push) await this.enviarPush();
      return nuevas;
    } catch (error) {
      this.registro.warn(`No se pudieron difundir notificaciones: ${(error as Error).message}`);
      return 0;
    } finally {
      this.corriendo = false;
    }
  }

  // Cada notificación se reclama con una marca: entre varias instancias, solo una envía el push
  private async enviarPush(): Promise<void> {
    const reclamadas = await this.prisma.$queryRaw<Fila[]>`
      UPDATE notificacion SET push_enviada_en = now()
       WHERE push_enviada_en IS NULL AND creada_en > now() - ${ANTIGUEDAD_PUSH}::interval
         AND usuario_id IN (SELECT usuario_id FROM suscripcion_push)
      RETURNING id, usuario_id, tipo::text AS tipo, titulo, mensaje, enlace, creada_en`;
    for (const aviso of reclamadas) {
      const suscripciones = await this.prisma.suscripcionPush.findMany({ where: { usuarioId: aviso.usuario_id } });
      for (const suscripcion of suscripciones) {
        try {
          await sendNotification(
            { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
            JSON.stringify({ titulo: aviso.titulo, mensaje: aviso.mensaje, enlace: aviso.enlace }),
          );
        } catch (error) {
          const estado = (error as { statusCode?: number }).statusCode;
          // El navegador dio de baja la suscripción
          if (estado === 404 || estado === 410)
            await this.prisma.suscripcionPush.delete({ where: { id: suscripcion.id } });
        }
      }
    }
  }
}
