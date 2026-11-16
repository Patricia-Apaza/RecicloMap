import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';

export type MensajeEnviado = {
  canal: 'sms' | 'correo';
  destino: string;
  asunto?: string;
  texto: string;
  enviadoEn: Date;
};

const MAXIMO_EN_MEMORIA = 200;

// Proveedor simulado: los SMS y correos llegan al buzón de pruebas; el proveedor real se conecta antes de publicar
@Injectable()
export class Mensajeria implements OnModuleDestroy {
  private readonly registro = new Logger('Mensajeria');
  private readonly enviados: MensajeEnviado[] = [];
  private readonly transporte: Transporter | undefined;

  constructor(configuracion: Configuracion) {
    if (configuracion.proveedorMensajes === 'simulado') {
      this.transporte = nodemailer.createTransport({
        host: configuracion.correo.host,
        port: configuracion.correo.puerto,
        secure: false,
        ignoreTLS: true,
      });
    }
  }

  async enviarSms(telefono: string, texto: string): Promise<void> {
    this.guardar({ canal: 'sms', destino: telefono, texto, enviadoEn: new Date() });
    await this.alBuzon(`sms-${telefono}@sms.reciclomap.test`, `SMS para ${telefono}`, texto);
  }

  async enviarCorreo(correo: string, asunto: string, texto: string): Promise<void> {
    this.guardar({ canal: 'correo', destino: correo, asunto, texto, enviadoEn: new Date() });
    await this.alBuzon(correo, asunto, texto);
  }

  ultimoPara(destino: string): MensajeEnviado | undefined {
    return [...this.enviados].reverse().find((mensaje) => mensaje.destino === destino);
  }

  onModuleDestroy(): void {
    this.transporte?.close();
  }

  private guardar(mensaje: MensajeEnviado): void {
    this.enviados.push(mensaje);
    if (this.enviados.length > MAXIMO_EN_MEMORIA) this.enviados.shift();
  }

  // Un buzón caído no debe impedir el registro: se avisa en los registros y se sigue
  private async alBuzon(para: string, asunto: string, texto: string): Promise<void> {
    if (!this.transporte) return;
    try {
      await this.transporte.sendMail({
        from: 'RecicloMap <no-responder@reciclomap.test>',
        to: para,
        subject: asunto,
        text: texto,
      });
    } catch (error) {
      this.registro.warn(`No se pudo dejar el mensaje en el buzón de pruebas: ${(error as Error).message}`);
    }
  }
}
