import { Controller, Get } from '@nestjs/common';
import { ADMIN } from '../prisma/datos-semilla.js';
import { NegocioVerificado, Roles } from '../src/nucleo/seguridad/decoradores.js';
import { bearer, crearPrueba, entrar, nuevoNegocio, type Prueba, registroCentro, zonaDeJuliaca } from './apoyo.js';

type Cuerpo = Record<string, unknown>;
const cuerpo = (respuesta: { body: unknown }) => respuesta.body as Cuerpo;
const error = (respuesta: { body: unknown }) =>
  (respuesta.body as { error: { codigo: string; mensaje: string; campos?: { campo: string; mensaje: string }[] } })
    .error;

// Ruta que solo existe en esta prueba: representa cualquier acción de negocio que exige estar verificado (RN-18)
@Roles('CENTRO', 'COMPRADOR_MOVIL')
@NegocioVerificado()
@Controller('prueba-verificado')
class RutaVerificada {
  @Get()
  responder(): { ok: true } {
    return { ok: true };
  }
}

type FilaCola = { id: string; estado: string; comprador: { nombreComercial: string } };

describe('Registro de negocios y verificación', () => {
  let prueba: Prueba;
  let admin: string;
  let zonaId: number;

  beforeAll(async () => {
    prueba = await crearPrueba({ controladores: [RutaVerificada] });
    admin = await entrar(prueba, ADMIN.telefono);
    zonaId = await zonaDeJuliaca(prueba);
  });
  afterAll(async () => {
    await prueba.cerrar();
  });

  const cola = async (estado = 'pendientes') =>
    (await prueba.http().get(`/api/v1/admin/verificaciones?estado=${estado}`).set(bearer(admin)).expect(200)).body as {
      datos: FilaCola[];
      conteos: Record<string, number>;
    };

  it('la cola muestra los dos negocios pendientes de la semilla', async () => {
    const pendientes = await cola('pendientes');
    const pedidas = await cola('info-pedida');
    expect(pendientes.datos.map((fila) => fila.comprador.nombreComercial)).toContain('Acopio Los Pinos');
    expect(pedidas.datos.map((fila) => fila.comprador.nombreComercial)).toContain('Reciclajes Sur');
  });

  describe('un centro nuevo', () => {
    const telefono = '922000001';
    let token: string;

    beforeAll(async () => {
      token = await nuevoNegocio(prueba, telefono);
    });

    it('tras verificar el teléfono queda con el registro por completar', async () => {
      const estado = await prueba.http().get('/api/v1/yo').set(bearer(token)).expect(200);
      expect(cuerpo(estado)).toMatchObject({
        rol: 'CENTRO',
        estado: 'REGISTRO_INCOMPLETO',
        siguientePaso: 'COMPLETAR_NEGOCIO',
      });
    });

    it('guarda el borrador por pasos en el servidor', async () => {
      await prueba
        .http()
        .put('/api/v1/mi-negocio/registro')
        .set(bearer(token))
        .send({ paso: 2, datos: { nombreComercial: 'EcoAcopio Prueba' } })
        .expect(200);
      const estado = await prueba.http().get('/api/v1/mi-negocio').set(bearer(token)).expect(200);
      expect(cuerpo(estado).borrador).toMatchObject({ paso: 2, datos: { nombreComercial: 'EcoAcopio Prueba' } });
    });

    it('el error de precio dice qué material falta', async () => {
      const datos = registroCentro(zonaId);
      const respuesta = await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(token))
        .send({ ...datos, precios: { ...datos.precios, papel: { max: 0.4 } } })
        .expect(400);
      expect(error(respuesta).campos?.map((campo) => campo.mensaje)).toContain('Falta el precio mínimo de Papel.');
    });

    it('rechaza precios fuera de S/ 0.10 a S/ 50.00 o con el máximo menor al mínimo', async () => {
      const datos = registroCentro(zonaId);
      const respuesta = await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(token))
        .send({ ...datos, precios: { pet: { min: 0.05, max: 1 }, carton: { min: 0.5, max: 0.3 } } })
        .expect(400);
      const mensajes = error(respuesta).campos?.map((campo) => campo.mensaje) ?? [];
      expect(mensajes).toContain('El precio de PET debe estar entre S/ 0.10 y S/ 50.00 por kg.');
      expect(mensajes).toContain('En Cartón, el precio máximo no puede ser menor que el mínimo.');
    });

    it('no acepta un registro de comprador móvil en una cuenta de centro', async () => {
      const { direccion: _direccion, ...resto } = registroCentro(zonaId);
      const respuesta = await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(token))
        .send({ ...resto, tipo: 'MOVIL', vehiculo: 'TRICICLO' })
        .expect(422);
      expect(error(respuesta).codigo).toBe('TIPO_DE_NEGOCIO');
    });

    it('al enviar queda "En revisión" con precio y demanda guardados por separado', async () => {
      const respuesta = await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(token))
        .send(registroCentro(zonaId))
        .expect(200);
      expect(cuerpo(respuesta).verificacion).toMatchObject({ estado: 'EN_REVISION' });
      expect((cuerpo(respuesta).negocio as Cuerpo).precios).toEqual(
        expect.arrayContaining([
          { material: { codigo: 'pet', nombre: 'PET' }, min: '0.80', max: '1.20', demanda: 'ALTA' },
          { material: { codigo: 'carton', nombre: 'Cartón' }, min: '0.30', max: '0.50', demanda: 'MEDIA' },
        ]),
      );
      expect(cuerpo(respuesta).borrador).toBeNull();
      await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(token))
        .send(registroCentro(zonaId))
        .expect(403);
    });

    it('RN-18: sin verificar no puede operar ni aparece en el mapa', async () => {
      const respuesta = await prueba.http().get('/api/v1/prueba-verificado').set(bearer(token)).expect(403);
      expect(error(respuesta).codigo).toBe('NEGOCIO_NO_VERIFICADO');
      const enMapa = await prueba.bd.$queryRaw<{ total: bigint }[]>`
        SELECT count(DISTINCT comprador_id) AS total FROM v_mapa WHERE nombre_comercial = 'EcoAcopio Prueba'`;
      expect(Number(enMapa[0]!.total)).toBe(0);
    });

    it('el administrador pide información: queda en auditoría y el negocio recibe aviso y SMS', async () => {
      const fila = (await cola()).datos.find((item) => item.comprador.nombreComercial === 'EcoAcopio Prueba')!;
      const detalle = await prueba.http().get(`/api/v1/admin/verificaciones/${fila.id}`).set(bearer(admin)).expect(200);
      expect((cuerpo(detalle).comprador as Cuerpo).precios).toHaveLength(2);

      await prueba
        .http()
        .post(`/api/v1/admin/verificaciones/${fila.id}/pedir-informacion`)
        .set(bearer(admin))
        .send({ motivo: 'Falta foto del local', mensaje: 'Sube una foto de la fachada.' })
        .expect(200);

      const estado = await prueba.http().get('/api/v1/mi-negocio/verificacion').set(bearer(token)).expect(200);
      expect(cuerpo(estado)).toMatchObject({ estado: 'INFO_PEDIDA', motivo: 'Falta foto del local' });
      expect(prueba.mensajes.ultimoPara(telefono)?.texto).toContain('necesitamos más información');
      const avisos = await prueba.http().get('/api/v1/notificaciones').set(bearer(token)).expect(200);
      expect(JSON.stringify(avisos.body)).toContain('Necesitamos más información');
      const auditoria = await prueba.bd.auditoria.findFirst({
        where: { entidadId: fila.id, accion: 'PEDIR_INFORMACION' },
      });
      expect(auditoria?.motivo).toBe('Falta foto del local');
    });

    it('corrige y vuelve a la cola sin dejar la verificación anterior abierta', async () => {
      await prueba
        .http()
        .post('/api/v1/mi-negocio/verificacion/reenviar')
        .set(bearer(token))
        .send(registroCentro(zonaId))
        .expect(200);
      const pedidas = await cola('info-pedida');
      expect(pedidas.datos.map((fila) => fila.comprador.nombreComercial)).not.toContain('EcoAcopio Prueba');
      const pendientes = await cola('pendientes');
      expect(pendientes.datos.filter((fila) => fila.comprador.nombreComercial === 'EcoAcopio Prueba')).toHaveLength(1);
    });

    it('rechazar exige un motivo de la lista', async () => {
      const fila = (await cola()).datos.find((item) => item.comprador.nombreComercial === 'EcoAcopio Prueba')!;
      await prueba
        .http()
        .post(`/api/v1/admin/verificaciones/${fila.id}/rechazar`)
        .set(bearer(admin))
        .send({ mensaje: 'Sin motivo' })
        .expect(400);
    });

    it('RN-18: al aprobar puede operar, aparece en el mapa y recibe aviso y SMS', async () => {
      const fila = (await cola()).datos.find((item) => item.comprador.nombreComercial === 'EcoAcopio Prueba')!;
      await prueba.http().post(`/api/v1/admin/verificaciones/${fila.id}/aprobar`).set(bearer(admin)).expect(200);

      await prueba.http().get('/api/v1/prueba-verificado').set(bearer(token)).expect(200);
      const enMapa = await prueba.bd.$queryRaw<{ total: bigint }[]>`
        SELECT count(DISTINCT comprador_id) AS total FROM v_mapa WHERE nombre_comercial = 'EcoAcopio Prueba'`;
      expect(Number(enMapa[0]!.total)).toBe(1);
      expect(prueba.mensajes.ultimoPara(telefono)?.texto).toContain('ya está verificado');
      const avisos = await prueba.http().get('/api/v1/notificaciones').set(bearer(token)).expect(200);
      expect(JSON.stringify(avisos.body)).toContain('Cuenta verificada');
      expect(await prueba.bd.auditoria.count({ where: { entidadId: fila.id, accion: 'APROBAR' } })).toBe(1);

      const repetida = await prueba
        .http()
        .post(`/api/v1/admin/verificaciones/${fila.id}/aprobar`)
        .set(bearer(admin))
        .expect(409);
      expect(error(repetida).codigo).toBe('VERIFICACION_RESUELTA');
    });
  });

  it('rechazar con motivo deja el negocio fuera del mapa y le avisa', async () => {
    const fila = (await cola()).datos.find((item) => item.comprador.nombreComercial === 'Acopio Los Pinos')!;
    await prueba
      .http()
      .post(`/api/v1/admin/verificaciones/${fila.id}/rechazar`)
      .set(bearer(admin))
      .send({ motivo: 'Dirección no verificable', mensaje: 'La dirección no coincide con el mapa.' })
      .expect(200);
    const resueltas = await cola('resueltas');
    expect(resueltas.datos.find((item) => item.id === fila.id)?.estado).toBe('RECHAZADO');
    expect(await prueba.bd.auditoria.count({ where: { entidadId: fila.id, accion: 'RECHAZAR' } })).toBe(1);
  });

  it('un comprador móvil se registra con su zona de trabajo y vehículo', async () => {
    const token = await nuevoNegocio(prueba, '922000002', 'MOVIL');
    const { direccion: _direccion, ...resto } = registroCentro(zonaId, 'Recojo Prueba');
    const respuesta = await prueba
      .http()
      .post('/api/v1/mi-negocio/registro/enviar')
      .set(bearer(token))
      .send({ ...resto, tipo: 'MOVIL', vehiculo: 'TRICICLO' })
      .expect(200);
    expect(cuerpo(respuesta).negocio).toMatchObject({ tipo: 'MOVIL', vehiculo: 'TRICICLO', zona: { id: zonaId } });
  });

  it('un negocio no entra a la cola del administrador', async () => {
    const token = await entrar(prueba, '900000011');
    await prueba.http().get('/api/v1/admin/verificaciones').set(bearer(token)).expect(403);
  });
});
