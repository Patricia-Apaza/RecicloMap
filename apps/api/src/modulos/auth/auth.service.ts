import { Injectable } from '@nestjs/common';
import {
  type esquemaCambiarContrasena,
  type esquemaCompletarGoogle,
  esquemaCorreo,
  type esquemaRegistroNegocio,
  type esquemaRegistroReciclador,
  esquemaTelefono,
  type SiguientePaso,
} from '@reciclomap/shared';
import type { z } from 'zod';
import { Prisma } from '../../generado/prisma/client.js';
import type { PropositoCodigo } from '../../generado/prisma/enums.js';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { compararSinCuenta, hashearContrasena, verificarContrasena } from '../../nucleo/seguridad/contrasenas.js';
import { Sesiones } from '../../nucleo/seguridad/sesiones.js';
import { Tokens } from '../../nucleo/seguridad/tokens.js';
import { type CodigoEnviado, Codigos } from './codigos.js';
import {
  ciudadActiva,
  comprobarDisponibles,
  consentimientosIniciales,
  enmascararTelefono,
  errorDuplicado,
  nuevoCodigoInvitacion,
  type ResumenUsuario,
  resumenUsuario,
} from './cuentas.js';
import { VerificadorGoogle } from './google.js';

export type Sesion = { tokenAcceso: string; expiraEn: string; usuario: ResumenUsuario };
export type SesionAbierta = { sesion: Sesion; tokenRefresco: string };

// Respuesta cuando falta un paso antes de abrir sesión
export type PasoPendiente = {
  siguientePaso: SiguientePaso;
  telefono?: string;
  tokenTemporal?: string;
  nombre?: string;
  correo?: string;
} & Partial<CodigoEnviado>;

export type ResultadoAcceso = { tipo: 'sesion'; abierta: SesionAbierta } | { tipo: 'paso'; paso: PasoPendiente };

const CREDENCIALES_INVALIDAS = () =>
  new ErrorNegocio('CREDENCIALES_INVALIDAS', 'El teléfono, el correo o la contraseña no son correctos.', 401);

type Identificador = { telefono: string } | { correo: string };

function leerIdentificador(texto: string): Identificador | null {
  if (texto.includes('@')) {
    const correo = esquemaCorreo.safeParse(texto);
    return correo.success ? { correo: correo.data } : null;
  }
  const telefono = esquemaTelefono.safeParse(texto);
  return telefono.success ? { telefono: telefono.data } : null;
}

function esDuplicado(error: unknown): 'telefono' | 'correo' | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return JSON.stringify(error.meta ?? {}).includes('correo') ? 'correo' : 'telefono';
  }
  return null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaApi,
    private readonly codigos: Codigos,
    private readonly sesiones: Sesiones,
    private readonly tokens: Tokens,
    private readonly google: VerificadorGoogle,
  ) {}

  async registrarReciclador(datos: z.infer<typeof esquemaRegistroReciclador>): Promise<PasoPendiente> {
    await comprobarDisponibles(this.prisma, datos.telefono, datos.correo);
    const invitador = datos.codigoInvitacion
      ? await this.prisma.recicladorPerfil.findUnique({
          where: { codigoInvitacion: datos.codigoInvitacion.toUpperCase() },
          select: { usuarioId: true },
        })
      : null;
    if (datos.codigoInvitacion && !invitador) {
      throw new ErrorNegocio('CODIGO_INVITACION_INVALIDO', 'Ese código de invitación no existe.', 422, [
        { campo: 'codigoInvitacion', mensaje: 'Revisa el código o déjalo en blanco.' },
      ]);
    }

    const usuario = await this.crearCuenta(async (tx) =>
      tx.usuario.create({
        data: {
          rol: 'RECICLADOR',
          nombre: datos.nombre,
          telefono: datos.telefono,
          correo: datos.correo,
          hashContrasena: await hashearContrasena(datos.contrasena),
          ciudadId: await ciudadActiva(tx),
          estado: 'PENDIENTE_TELEFONO',
          preferencia: { create: {} },
          consentimientos: consentimientosIniciales(),
          perfilReciclador: {
            create: { codigoInvitacion: nuevoCodigoInvitacion(), invitadoPorId: invitador?.usuarioId },
          },
          ...(invitador ? { invitacionRecibida: { create: { invitadorId: invitador.usuarioId } } } : {}),
        },
        select: { id: true, telefono: true },
      }),
    );
    return this.pedirVerificacion(usuario.id, usuario.telefono);
  }

  async registrarNegocio(datos: z.infer<typeof esquemaRegistroNegocio>): Promise<PasoPendiente> {
    await comprobarDisponibles(this.prisma, datos.telefono, datos.correo);
    const usuario = await this.crearCuenta(async (tx) =>
      tx.usuario.create({
        data: {
          rol: datos.tipo === 'CENTRO' ? 'CENTRO' : 'COMPRADOR_MOVIL',
          nombre: 'Nuevo negocio',
          telefono: datos.telefono,
          correo: datos.correo,
          hashContrasena: await hashearContrasena(datos.contrasena),
          ciudadId: await ciudadActiva(tx),
          estado: 'PENDIENTE_TELEFONO',
          preferencia: { create: {} },
          consentimientos: consentimientosIniciales(),
        },
        select: { id: true, telefono: true },
      }),
    );
    return this.pedirVerificacion(usuario.id, usuario.telefono);
  }

  // Misma respuesta exista o no la cuenta pendiente: no revela qué teléfonos están registrados
  async reenviarCodigoTelefono(telefono: string): Promise<PasoPendiente> {
    const usuario = await this.prisma.usuario.findUnique({ where: { telefono }, select: { id: true, estado: true } });
    const respuesta: PasoPendiente = {
      siguientePaso: 'VERIFICAR_TELEFONO',
      telefono: enmascararTelefono(telefono),
      reenviarEn: 60,
    };
    if (usuario?.estado !== 'PENDIENTE_TELEFONO') return respuesta;
    return { ...respuesta, ...(await this.enviarCodigo(telefono, 'VERIFICAR_TELEFONO', usuario.id)) };
  }

  async verificarTelefono(telefono: string, codigo: string, agente?: string): Promise<SesionAbierta> {
    const usuarioId = await this.codigos.verificar(telefono, 'VERIFICAR_TELEFONO', codigo);
    const usuario = usuarioId
      ? await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { rol: true, estado: true } })
      : null;
    if (!usuarioId || usuario?.estado !== 'PENDIENTE_TELEFONO') {
      throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);
    }
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        telefonoVerificadoEn: new Date(),
        estado: usuario.rol === 'RECICLADOR' ? 'ACTIVO' : 'REGISTRO_INCOMPLETO',
      },
    });
    return this.abrirSesion(usuarioId, agente);
  }

  async iniciarSesion(identificador: string, contrasena: string, agente?: string): Promise<ResultadoAcceso> {
    const clave = leerIdentificador(identificador);
    const usuario = clave
      ? await this.prisma.usuario.findUnique({
          where: clave,
          select: { id: true, rol: true, estado: true, telefono: true, hashContrasena: true },
        })
      : null;
    if (!usuario?.hashContrasena || usuario.estado === 'ELIMINADO') {
      await compararSinCuenta(contrasena);
      throw CREDENCIALES_INVALIDAS();
    }
    if (!(await verificarContrasena(usuario.hashContrasena, contrasena))) throw CREDENCIALES_INVALIDAS();

    if (usuario.estado === 'PENDIENTE_TELEFONO') {
      return { tipo: 'paso', paso: await this.pedirVerificacion(usuario.id, usuario.telefono, true) };
    }
    if (usuario.rol === 'ADMIN') {
      const codigo = await this.enviarCodigoTolerante(usuario.telefono, 'INICIO_ADMIN', usuario.id);
      const tokenTemporal = await this.tokens.firmarTemporal('CODIGO_ADMIN', { sub: usuario.id }, 10);
      return {
        tipo: 'paso',
        paso: {
          siguientePaso: 'CODIGO_ADMIN',
          tokenTemporal,
          telefono: enmascararTelefono(usuario.telefono),
          ...codigo,
        },
      };
    }
    return { tipo: 'sesion', abierta: await this.abrirSesion(usuario.id, agente) };
  }

  async verificarCodigoAdmin(tokenTemporal: string, codigo: string, agente?: string): Promise<SesionAbierta> {
    const { sub } = await this.tokens.verificarTemporal(tokenTemporal, 'CODIGO_ADMIN');
    const admin = sub
      ? await this.prisma.usuario.findUnique({
          where: { id: sub },
          select: { rol: true, estado: true, telefono: true },
        })
      : null;
    if (!sub || admin?.rol !== 'ADMIN' || admin.estado !== 'ACTIVO') throw CREDENCIALES_INVALIDAS();
    const dueno = await this.codigos.verificar(admin.telefono, 'INICIO_ADMIN', codigo);
    if (dueno !== sub) throw CREDENCIALES_INVALIDAS();
    return this.abrirSesion(sub, agente);
  }

  async iniciarConGoogle(credencial: string, agente?: string): Promise<ResultadoAcceso> {
    const identidad = await this.google.verificar(credencial);
    const vinculada = await this.prisma.identidadExterna.findUnique({
      where: { proveedor_sujeto: { proveedor: 'GOOGLE', sujeto: identidad.sujeto } },
      select: { usuario: { select: { id: true, estado: true, telefono: true } } },
    });
    if (vinculada) {
      const { usuario } = vinculada;
      if (usuario.estado === 'ELIMINADO') throw CREDENCIALES_INVALIDAS();
      if (usuario.estado === 'PENDIENTE_TELEFONO') {
        return { tipo: 'paso', paso: await this.pedirVerificacion(usuario.id, usuario.telefono, true) };
      }
      return { tipo: 'sesion', abierta: await this.abrirSesion(usuario.id, agente) };
    }
    const datos: Record<string, string> = { sujeto: identidad.sujeto };
    if (identidad.correo && identidad.correoVerificado) datos.correo = identidad.correo;
    if (identidad.nombre) datos.nombre = identidad.nombre;
    return {
      tipo: 'paso',
      paso: {
        siguientePaso: 'COMPLETAR_CUENTA_GOOGLE',
        tokenTemporal: await this.tokens.firmarTemporal('COMPLETAR_GOOGLE', datos, 30),
        nombre: identidad.nombre,
        correo: datos.correo,
      },
    };
  }

  // La cuenta de Google necesita rol y teléfono verificado antes de usar la app
  async completarCuentaGoogle(datos: z.infer<typeof esquemaCompletarGoogle>): Promise<PasoPendiente> {
    const temporal = await this.tokens.verificarTemporal(datos.tokenTemporal, 'COMPLETAR_GOOGLE');
    const sujeto = temporal.sujeto;
    if (!sujeto) throw new ErrorNegocio('PASO_VENCIDO', 'Este paso venció. Vuelve a empezar.', 401);
    const yaVinculada = await this.prisma.identidadExterna.count({ where: { proveedor: 'GOOGLE', sujeto } });
    if (yaVinculada)
      throw new ErrorNegocio('GOOGLE_YA_VINCULADO', 'Esta cuenta de Google ya está registrada. Inicia sesión.', 409);
    await comprobarDisponibles(this.prisma, datos.telefono);
    const correoLibre =
      temporal.correo && !(await this.prisma.usuario.count({ where: { correo: temporal.correo } }))
        ? temporal.correo
        : undefined;

    const esReciclador = datos.rol === 'RECICLADOR';
    const usuario = await this.crearCuenta(async (tx) =>
      tx.usuario.create({
        data: {
          rol: datos.rol,
          nombre: temporal.nombre?.slice(0, 120) || (esReciclador ? 'Reciclador' : 'Nuevo negocio'),
          telefono: datos.telefono,
          correo: correoLibre,
          correoVerificadoEn: correoLibre ? new Date() : undefined,
          ciudadId: await ciudadActiva(tx),
          estado: 'PENDIENTE_TELEFONO',
          preferencia: { create: {} },
          consentimientos: consentimientosIniciales(),
          identidades: { create: { proveedor: 'GOOGLE', sujeto } },
          ...(esReciclador ? { perfilReciclador: { create: { codigoInvitacion: nuevoCodigoInvitacion() } } } : {}),
        },
        select: { id: true, telefono: true },
      }),
    );
    return this.pedirVerificacion(usuario.id, usuario.telefono);
  }

  async renovar(tokenRefresco: string, agente?: string): Promise<SesionAbierta> {
    const { usuarioId, sesionId, tokenRefresco: nuevo } = await this.sesiones.rotar(tokenRefresco, agente);
    return { sesion: await this.armarSesion(usuarioId, sesionId), tokenRefresco: nuevo };
  }

  cerrarSesion(tokenRefresco: string | undefined): Promise<void> {
    return tokenRefresco ? this.sesiones.revocarPorToken(tokenRefresco) : Promise.resolve();
  }

  cerrarTodas(usuarioId: string): Promise<void> {
    return this.sesiones.revocarTodas(usuarioId);
  }

  // Misma respuesta exista o no la cuenta
  async pedirRecuperacion(identificador: string): Promise<PasoPendiente> {
    const clave = leerIdentificador(identificador);
    const respuesta: PasoPendiente = { siguientePaso: 'VERIFICAR_TELEFONO', reenviarEn: 60 };
    if (!clave) return respuesta;
    const usuario = await this.prisma.usuario.findUnique({
      where: clave,
      select: { id: true, estado: true },
    });
    if (!usuario || usuario.estado === 'ELIMINADO' || usuario.estado === 'PENDIENTE_TELEFONO') return respuesta;
    try {
      const destino = 'correo' in clave ? clave.correo : clave.telefono;
      const enviado = await this.codigos.enviar({
        destino,
        proposito: 'RECUPERAR_CONTRASENA',
        canal: 'correo' in clave ? 'correo' : 'sms',
        usuarioId: usuario.id,
      });
      return { ...respuesta, ...enviado };
    } catch (error) {
      if (error instanceof ErrorNegocio && error.estado === 429) return respuesta;
      throw error;
    }
  }

  async verificarRecuperacion(identificador: string, codigo: string): Promise<{ tokenRestablecer: string }> {
    const clave = leerIdentificador(identificador);
    if (!clave) throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);
    const destino = 'correo' in clave ? clave.correo : clave.telefono;
    const usuarioId = await this.codigos.verificar(destino, 'RECUPERAR_CONTRASENA', codigo);
    if (!usuarioId) throw new ErrorNegocio('CODIGO_VENCIDO', 'El código venció o no existe. Pide uno nuevo.', 422);
    return { tokenRestablecer: await this.tokens.firmarTemporal('RESTABLECER', { sub: usuarioId }, 10) };
  }

  async restablecer(tokenRestablecer: string, contrasena: string): Promise<void> {
    const { sub } = await this.tokens.verificarTemporal(tokenRestablecer, 'RESTABLECER');
    if (!sub) throw new ErrorNegocio('PASO_VENCIDO', 'Este paso venció. Vuelve a empezar.', 401);
    await this.prisma.usuario.update({
      where: { id: sub },
      data: { hashContrasena: await hashearContrasena(contrasena) },
    });
    await this.sesiones.revocarTodas(sub);
  }

  async cambiarContrasena(usuarioId: string, datos: z.infer<typeof esquemaCambiarContrasena>): Promise<void> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { hashContrasena: true },
    });
    if (!usuario.hashContrasena) {
      throw new ErrorNegocio(
        'SIN_CONTRASENA',
        'Tu cuenta entra con Google. Usa “Olvidé mi contraseña” para crear una.',
        422,
      );
    }
    if (!(await verificarContrasena(usuario.hashContrasena, datos.actual))) {
      throw new ErrorNegocio('CONTRASENA_INCORRECTA', 'La contraseña actual no es correcta.', 422, [
        { campo: 'actual', mensaje: 'No es correcta.' },
      ]);
    }
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { hashContrasena: await hashearContrasena(datos.nueva) },
    });
    await this.sesiones.revocarTodas(usuarioId);
  }

  private async abrirSesion(usuarioId: string, agente?: string): Promise<SesionAbierta> {
    const { sesionId, tokenRefresco } = await this.sesiones.crear(usuarioId, agente);
    return { sesion: await this.armarSesion(usuarioId, sesionId), tokenRefresco };
  }

  private async armarSesion(usuarioId: string, sesionId: string): Promise<Sesion> {
    const { token, expiraEn } = await this.tokens.firmarAcceso(usuarioId, sesionId);
    return {
      tokenAcceso: token,
      expiraEn: expiraEn.toISOString(),
      usuario: await resumenUsuario(this.prisma, usuarioId),
    };
  }

  private async pedirVerificacion(usuarioId: string, telefono: string, toleraEspera = false): Promise<PasoPendiente> {
    const base: PasoPendiente = {
      siguientePaso: 'VERIFICAR_TELEFONO',
      telefono: enmascararTelefono(telefono),
      reenviarEn: 60,
    };
    const enviado = toleraEspera
      ? await this.enviarCodigoTolerante(telefono, 'VERIFICAR_TELEFONO', usuarioId)
      : await this.enviarCodigo(telefono, 'VERIFICAR_TELEFONO', usuarioId);
    return { ...base, ...enviado };
  }

  // Al volver a entrar, un código enviado hace segundos sigue sirviendo
  private async enviarCodigoTolerante(
    telefono: string,
    proposito: PropositoCodigo,
    usuarioId: string,
  ): Promise<Partial<CodigoEnviado>> {
    try {
      return await this.enviarCodigo(telefono, proposito, usuarioId);
    } catch (error) {
      if (error instanceof ErrorNegocio && error.estado === 429) return { reenviarEn: 60 };
      throw error;
    }
  }

  private enviarCodigo(telefono: string, proposito: PropositoCodigo, usuarioId: string): Promise<CodigoEnviado> {
    return this.codigos.enviar({ destino: telefono, proposito, canal: 'sms', usuarioId });
  }

  private async crearCuenta<T>(crear: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(crear);
    } catch (error) {
      const campo = esDuplicado(error);
      if (campo) throw errorDuplicado(campo);
      throw error;
    }
  }
}
