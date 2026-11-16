import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

export type IdentidadGoogle = { sujeto: string; correo?: string; correoVerificado: boolean; nombre?: string };

// Se inyecta como clase abstracta para poder reemplazarla en las pruebas
export abstract class VerificadorGoogle {
  abstract verificar(credencial: string): Promise<IdentidadGoogle>;
}

@Injectable()
export class VerificadorGoogleOficial extends VerificadorGoogle {
  private readonly cliente = new OAuth2Client();

  constructor(private readonly configuracion: Configuracion) {
    super();
  }

  async verificar(credencial: string): Promise<IdentidadGoogle> {
    const idCliente = this.configuracion.googleClientId;
    if (!idCliente) {
      throw new ErrorNegocio('GOOGLE_NO_DISPONIBLE', 'El inicio con Google todavía no está disponible.', 503);
    }
    try {
      const ticket = await this.cliente.verifyIdToken({ idToken: credencial, audience: idCliente });
      const datos = ticket.getPayload();
      if (!datos?.sub) throw new Error('Credencial sin sujeto');
      return {
        sujeto: datos.sub,
        correo: datos.email?.toLowerCase(),
        correoVerificado: datos.email_verified === true,
        nombre: datos.name,
      };
    } catch {
      throw new ErrorNegocio('GOOGLE_INVALIDO', 'No pudimos validar tu cuenta de Google. Intenta de nuevo.', 401);
    }
  }
}
